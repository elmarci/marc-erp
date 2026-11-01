import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { StoreCustomer } from '@prisma/client';
import { prisma } from '../../database/client';
import { AuthenticationError, BusinessError, NotFoundError } from '../../utils/errors';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { codeEmail, sendMail } from '../../utils/mailer';

const CUSTOMER_JWT_SECRET = env.JWT_SECRET + '_customer';
const CODE_SECRET = env.JWT_SECRET + '_store_codes';
const TOKEN_EXPIRES = '30d';
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_PER_DAY = 10;
const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

type CodePurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

// ── Normalización y reglas ─────────────────────────────────────────────────

// Celular peruano: 9 dígitos que empiezan con 9. Acepta "987 654 321",
// "+51 987654321", "51987654321"… y siempre guarda "987654321".
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('51')) digits = digits.slice(2);
  return digits;
}

export function isValidPeruMobile(phone: string) {
  return /^9\d{8}$/.test(phone);
}

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

// Mínimo 8 caracteres con al menos una letra y un número. Máximo 72 porque
// bcrypt ignora lo que pase de 72 bytes.
export const PASSWORD_RULE_MESSAGE = 'La contraseña debe tener al menos 8 caracteres, con letras y números.';
export function isStrongPassword(pw: string) {
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) && /\d/.test(pw);
}

function hashCode(code: string) {
  return crypto.createHmac('sha256', CODE_SECRET).update(code).digest('hex');
}

// Hash de relleno para comparar aunque la cuenta no exista: así la respuesta
// tarda lo mismo y no revela qué teléfonos/correos están registrados.
const DUMMY_HASH = bcrypt.hashSync('marc-dummy-password-0', 10);

export class StoreAuthService {
  // Busca una cuenta por teléfono o correo (lo que la persona escriba en
  // "Teléfono o correo"). Cuentas antiguas pueden tener el teléfono guardado
  // con espacios, por eso también se busca el texto tal cual.
  private async findByIdentifier(identifier: string) {
    const raw = identifier.trim();
    if (raw.includes('@')) {
      return prisma.storeCustomer.findFirst({
        where: { email: { equals: normalizeEmail(raw), mode: 'insensitive' } },
      });
    }
    const phone = normalizePhone(raw);
    if (!phone) return null;
    const exact = await prisma.storeCustomer.findFirst({ where: { phone: { in: [phone, raw] } } });
    if (exact) return exact;
    // Cuentas antiguas guardaron el teléfono tal cual lo escribieron
    // ("987 654 321", "+51987654321"…): se compara solo por dígitos.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM store_customers
      WHERE regexp_replace(phone, '\\D', '', 'g') IN (${phone}, ${'51' + phone})
      LIMIT 1`;
    return rows[0] ? prisma.storeCustomer.findUnique({ where: { id: rows[0].id } }) : null;
  }

  private async emailTakenByOther(email: string, exceptId?: string) {
    const other = await prisma.storeCustomer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return !!other;
  }

  // Enlaza la cuenta de la tienda con su ficha en Clientes del ERP — solo si
  // el correo está verificado. Antes se enlazaba por teléfono sin más, y
  // cualquiera que escribiera el número de un cliente de caja veía sus
  // compras y podía canjear sus puntos.
  //  - Si no hay ficha con ese teléfono, se crea una nueva.
  //  - Si hay ficha con ese teléfono Y el mismo correo, se enlaza.
  //  - Si hay ficha con ese teléfono pero otro correo (o sin correo), NO se
  //    enlaza: en caja, tras confirmar la identidad, se registra el correo
  //    del cliente en su ficha y la próxima vez que entre se enlaza solo.
  private async linkErpCustomer(c: StoreCustomer): Promise<StoreCustomer> {
    if (c.customerId || !c.emailVerifiedAt || !c.email) return c;
    const phone = normalizePhone(c.phone);
    // Fichas del ERP con el mismo teléfono, comparando solo dígitos.
    const candidates = await prisma.$queryRaw<{ id: string; email: string | null }[]>`
      SELECT id, email FROM customers
      WHERE deleted_at IS NULL
        AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') IN (${phone}, ${'51' + phone})`;

    let customerId: string | null = null;
    if (candidates.length === 0) {
      const [firstName, ...rest] = c.name.trim().split(/\s+/);
      const created = await prisma.customer.create({
        data: {
          firstName: firstName || c.name,
          lastName: rest.join(' ') || null,
          phone, email: c.email,
          type: 'REGULAR',
          notes: 'Creado automáticamente al registrarse en la tienda online.',
        },
      });
      customerId = created.id;
    } else {
      const match = candidates.find(x => x.email && normalizeEmail(x.email) === normalizeEmail(c.email!));
      if (match) customerId = match.id;
      else logger.info({ storeCustomerId: c.id }, '[store-auth] ficha ERP con mismo teléfono y otro correo: no se enlaza automáticamente');
    }

    if (!customerId) return c;
    return prisma.storeCustomer.update({ where: { id: c.id }, data: { customerId } });
  }

  // ── Códigos por correo ───────────────────────────────────────────────────

  private async issueCode(c: StoreCustomer, purpose: CodePurpose, email: string) {
    const last = await prisma.storeVerificationCode.findFirst({
      where: { customerId: c.id, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - last.createdAt.getTime() < CODE_RESEND_COOLDOWN_MS) {
      throw new BusinessError('Ya te enviamos un código hace un momento. Espera un minuto para pedir otro.', 'CODE_COOLDOWN');
    }
    const sentToday = await prisma.storeVerificationCode.count({
      where: { customerId: c.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (sentToday >= CODE_MAX_PER_DAY) {
      throw new BusinessError('Pediste demasiados códigos hoy. Inténtalo mañana o escríbenos por WhatsApp.', 'CODE_DAILY_LIMIT');
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.$transaction([
      // Un solo código vigente por propósito: los anteriores dejan de servir.
      prisma.storeVerificationCode.updateMany({
        where: { customerId: c.id, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      prisma.storeVerificationCode.create({
        data: { customerId: c.id, purpose, email, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
      }),
    ]);

    const mail = purpose === 'VERIFY_EMAIL'
      ? codeEmail({ name: c.name, title: 'Confirma tu correo', intro: 'usa este código para confirmar tu correo en la tienda de Minimarket Marc:', code })
      : codeEmail({ name: c.name, title: 'Recupera tu contraseña', intro: 'recibimos un pedido para cambiar la contraseña de tu cuenta. Usa este código:', code });
    await sendMail(email, purpose === 'VERIFY_EMAIL' ? `${code} es tu código de Minimarket Marc` : `${code} es tu código para recuperar tu cuenta`, mail.html, mail.text);
  }

  private async consumeCode(customerId: string, purpose: CodePurpose, code: string) {
    const row = await prisma.storeVerificationCode.findFirst({
      where: { customerId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) {
      throw new BusinessError('El código venció o ya no es válido. Pide uno nuevo.', 'CODE_EXPIRED');
    }
    const given = Buffer.from(hashCode(code.trim()));
    const expected = Buffer.from(row.codeHash);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      const updated = await prisma.storeVerificationCode.update({
        where: { id: row.id }, data: { attempts: { increment: 1 } },
      });
      const left = CODE_MAX_ATTEMPTS - updated.attempts;
      throw new BusinessError(
        left > 0 ? `Código incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.` : 'Código incorrecto. Pide uno nuevo.',
        'CODE_INVALID',
      );
    }
    await prisma.storeVerificationCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return row;
  }

  // ── Registro / ingreso ──────────────────────────────────────────────────

  async register(data: { name: string; phone: string; email: string; password: string }) {
    const phone = normalizePhone(data.phone);
    const email = normalizeEmail(data.email);
    if (!isValidPeruMobile(phone)) throw new BusinessError('Ingresa un celular válido de 9 dígitos que empiece con 9.');
    if (!isStrongPassword(data.password)) throw new BusinessError(PASSWORD_RULE_MESSAGE);

    const existingPhone = await this.findByIdentifier(phone);
    if (existingPhone) throw new BusinessError('Ya existe una cuenta con ese teléfono. Si es tuya, usa "Olvidé mi contraseña".');
    if (await this.emailTakenByOther(email)) {
      throw new BusinessError('Ya existe una cuenta con ese correo. Si es tuya, usa "Olvidé mi contraseña".');
    }

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
    // Sin enlace al ERP todavía: se enlaza al verificar el correo.
    const customer = await prisma.storeCustomer.create({
      data: { name: data.name.trim(), phone, email, passwordHash },
    });

    await this.issueCode(customer, 'VERIFY_EMAIL', email).catch(err => {
      // La cuenta ya existe: si el correo falla, la pantalla de verificación
      // permite reenviar el código.
      logger.warn({ err, customerId: customer.id }, '[store-auth] no se pudo enviar el código de registro');
    });

    return { customer: this.safeCustomer(customer), token: this.generateToken(customer) };
  }

  async login(identifier: string, password: string) {
    const customer = await this.findByIdentifier(identifier);
    const hash = customer?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (customer && !customer.passwordHash && customer.googleId) {
      throw new BusinessError('Esta cuenta se creó con Google. Ingresa con el botón de Google.');
    }
    if (!customer || !customer.passwordHash || !valid) {
      throw new BusinessError('Teléfono/correo o contraseña incorrectos.', 'INVALID_CREDENTIALS');
    }
    if (!customer.isActive) throw new BusinessError('Esta cuenta está desactivada. Escríbenos por WhatsApp.');

    const linked = await this.linkErpCustomer(customer);
    return { customer: this.safeCustomer(linked), token: this.generateToken(linked) };
  }

  // Login/registro con Google. Google sólo confirma el email — nunca lo
  // usamos para asumir nombre ni teléfono. Cuando se está creando una
  // cuenta nueva, `phone` y `name` son obligatorios y los llena la persona
  // misma (NEEDS_PROFILE le pide el formulario antes de reintentar con el
  // mismo idToken).
  async loginWithGoogle(idToken: string, phoneRaw?: string, name?: string) {
    if (!googleClient) throw new BusinessError('El login con Google no está configurado todavía.');

    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified === false) {
      throw new BusinessError('No se pudo verificar la cuenta de Google.');
    }
    const googleEmail = normalizeEmail(payload.email);

    let customer = await prisma.storeCustomer.findUnique({ where: { googleId: payload.sub } });

    if (!customer) {
      const byEmail = await prisma.storeCustomer.findFirst({
        where: { email: { equals: googleEmail, mode: 'insensitive' } },
      });
      if (byEmail) {
        // Solo se une la cuenta de Google a una cuenta existente si ese
        // correo ya fue verificado. Si no, alguien pudo registrar un correo
        // ajeno y el verdadero dueño terminaría dentro de esa cuenta.
        if (!byEmail.emailVerifiedAt) {
          throw new BusinessError('Ya hay una cuenta con este correo. Ingresa con tu teléfono y contraseña, o usa "Olvidé mi contraseña" para recuperarla.');
        }
        customer = await prisma.storeCustomer.update({ where: { id: byEmail.id }, data: { googleId: payload.sub } });
      } else {
        if (!phoneRaw?.trim() || !name?.trim()) throw new BusinessError('NEEDS_PROFILE');
        const phone = normalizePhone(phoneRaw);
        if (!isValidPeruMobile(phone)) throw new BusinessError('Ingresa un celular válido de 9 dígitos que empiece con 9.');
        if (await this.findByIdentifier(phone)) {
          throw new BusinessError('Ya existe una cuenta con ese teléfono. Si es tuya, ingresa con tu contraseña o usa "Olvidé mi contraseña".');
        }
        customer = await prisma.storeCustomer.create({
          data: {
            name: name.trim(), phone, email: googleEmail, googleId: payload.sub,
            authProvider: 'GOOGLE', emailVerifiedAt: new Date(),
          },
        });
      }
    }

    if (!customer.isActive) throw new BusinessError('Esta cuenta está desactivada. Escríbenos por WhatsApp.');

    // Entrar con Google prueba que el correo es suyo.
    if (!customer.emailVerifiedAt && customer.email && normalizeEmail(customer.email) === googleEmail) {
      customer = await prisma.storeCustomer.update({ where: { id: customer.id }, data: { emailVerifiedAt: new Date() } });
    }

    customer = await this.linkErpCustomer(customer);
    return { customer: this.safeCustomer(customer), token: this.generateToken(customer) };
  }

  // ── Verificación de correo ──────────────────────────────────────────────

  // Envía el código al correo indicado (para cuentas antiguas sin correo, o
  // para corregir/cambiar el correo). El correo de la cuenta cambia recién
  // cuando se confirma el código: nadie puede "adueñarse" de un correo ajeno.
  async sendEmailCode(customerId: string, emailRaw?: string) {
    const customer = await prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundError('Cliente');
    const email = emailRaw ? normalizeEmail(emailRaw) : customer.email ? normalizeEmail(customer.email) : null;
    if (!email) throw new BusinessError('Ingresa tu correo.');
    if (customer.emailVerifiedAt && customer.email && normalizeEmail(customer.email) === email) {
      throw new BusinessError('Este correo ya está verificado.');
    }
    if (await this.emailTakenByOther(email, customer.id)) {
      throw new BusinessError('Ese correo ya está registrado en otra cuenta. Si es tuyo, usa "Olvidé mi contraseña" en esa cuenta.');
    }
    await this.issueCode(customer, 'VERIFY_EMAIL', email);
    return { sentTo: email };
  }

  async verifyEmail(customerId: string, code: string) {
    const row = await this.consumeCode(customerId, 'VERIFY_EMAIL', code);
    if (await this.emailTakenByOther(row.email, customerId)) {
      throw new BusinessError('Ese correo ya está registrado en otra cuenta.');
    }
    let customer = await prisma.storeCustomer.update({
      where: { id: customerId },
      data: { email: row.email, emailVerifiedAt: new Date() },
    });
    customer = await this.linkErpCustomer(customer);
    return this.safeCustomer(customer);
  }

  // ── Recuperación de contraseña ──────────────────────────────────────────

  // Siempre responde lo mismo, exista o no la cuenta, para no revelar qué
  // teléfonos/correos están registrados.
  async forgotPassword(identifier: string) {
    const customer = await this.findByIdentifier(identifier);
    if (customer?.isActive && customer.email) {
      await this.issueCode(customer, 'RESET_PASSWORD', normalizeEmail(customer.email)).catch(err => {
        if (err instanceof BusinessError && err.code.startsWith('CODE_')) return; // límite: no revelar
        throw err;
      });
    }
    return { ok: true };
  }

  async resetPassword(identifier: string, code: string, newPassword: string) {
    if (!isStrongPassword(newPassword)) throw new BusinessError(PASSWORD_RULE_MESSAGE);
    const customer = await this.findByIdentifier(identifier);
    if (!customer || !customer.isActive) throw new BusinessError('El código venció o ya no es válido. Pide uno nuevo.', 'CODE_EXPIRED');

    const row = await this.consumeCode(customer.id, 'RESET_PASSWORD', code);
    const sameEmail = !!customer.email && normalizeEmail(customer.email) === row.email;
    let updated = await prisma.storeCustomer.update({
      where: { id: customer.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS),
        // Cierra la sesión en todos los demás equipos.
        tokenVersion: { increment: 1 },
        // Recibir el código prueba que el correo es suyo.
        ...(sameEmail && !customer.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      },
    });
    // Ya no sirve ningún otro código de recuperación pendiente.
    await prisma.storeVerificationCode.updateMany({
      where: { customerId: customer.id, purpose: 'RESET_PASSWORD', consumedAt: null },
      data: { consumedAt: new Date() },
    });
    updated = await this.linkErpCustomer(updated);
    return { customer: this.safeCustomer(updated), token: this.generateToken(updated) };
  }

  async changePassword(customerId: string, currentPassword: string, newPassword: string) {
    if (!isStrongPassword(newPassword)) throw new BusinessError(PASSWORD_RULE_MESSAGE);
    const customer = await prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundError('Cliente');
    // Cuentas de Google sin contraseña pueden crear una sin la actual.
    if (customer.passwordHash && !(await bcrypt.compare(currentPassword, customer.passwordHash))) {
      throw new BusinessError('La contraseña actual no es correcta.');
    }
    const updated = await prisma.storeCustomer.update({
      where: { id: customerId },
      data: { passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
    });
    return { customer: this.safeCustomer(updated), token: this.generateToken(updated) };
  }

  // ── Perfil ──────────────────────────────────────────────────────────────

  async getProfile(customerId: string) {
    let base = await prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!base) throw new NotFoundError('Cliente');
    // Reintenta el enlace con el ERP (p. ej. si en caja le registraron el
    // correo a su ficha después de que creó la cuenta).
    base = await this.linkErpCustomer(base);
    const customer = await prisma.storeCustomer.findUniqueOrThrow({
      where: { id: customerId },
      include: {
        addresses: { orderBy: { isDefault: 'desc' } },
        customer: { select: { loyaltyPoints: true } },
      },
    });
    return {
      ...this.safeCustomer(customer),
      addresses: customer.addresses,
      loyaltyPoints: customer.customer?.loyaltyPoints ?? 0,
    };
  }

  // El correo ya no se cambia por acá: se cambia con código
  // (sendEmailCode + verifyEmail).
  async updateProfile(customerId: string, data: { name?: string }) {
    const customer = await prisma.storeCustomer.update({
      where: { id: customerId },
      data: { ...(data.name ? { name: data.name.trim() } : {}) },
    });
    return this.safeCustomer(customer);
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  // Valida firma, vencimiento, que la cuenta siga activa y que el token no
  // sea anterior al último cambio de contraseña. Tokens antiguos (sin "v")
  // cuentan como versión 0, así nadie pierde su sesión con este cambio.
  async verifyToken(token: string): Promise<{ id: string; emailVerified: boolean }> {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET) as { sub: string; v?: number };
    const c = await prisma.storeCustomer.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, tokenVersion: true, emailVerifiedAt: true },
    });
    if (!c || !c.isActive || c.tokenVersion !== (payload.v ?? 0)) throw new AuthenticationError('Tu sesión expiró. Vuelve a ingresar.');
    return { id: c.id, emailVerified: !!c.emailVerifiedAt };
  }

  private generateToken(c: { id: string; tokenVersion: number }): string {
    return jwt.sign({ sub: c.id, v: c.tokenVersion }, CUSTOMER_JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
  }

  private safeCustomer(c: {
    id: string; name: string; phone: string; email: string | null; createdAt: Date;
    emailVerifiedAt: Date | null; customerId: string | null; passwordHash?: string | null;
  }) {
    return {
      id: c.id, name: c.name, phone: c.phone, email: c.email, createdAt: c.createdAt,
      emailVerified: !!c.emailVerifiedAt,
      // false = sus compras en caja aún no se suman a esta cuenta.
      erpLinked: !!c.customerId,
      hasPassword: !!c.passwordHash,
    };
  }

  async addAddress(customerId: string, data: {
    label: string; address: string; district: string; reference?: string; isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await prisma.storeAddress.updateMany({
        where: { customerId }, data: { isDefault: false },
      });
    }
    return prisma.storeAddress.create({
      data: { ...data, customerId },
    });
  }

  async deleteAddress(customerId: string, addressId: string) {
    await prisma.storeAddress.deleteMany({ where: { id: addressId, customerId } });
  }

  async setDefaultAddress(customerId: string, addressId: string) {
    await prisma.storeAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    return prisma.storeAddress.update({ where: { id: addressId }, data: { isDefault: true } });
  }

  // "Reporte de consumos" del perfil — cantidad comprada por producto en un
  // rango de fechas. Se lee directo de las Ventas reales del ERP (no de los
  // pedidos web nada más) para que cuente TODO lo que compró, incluida la
  // mercadería que llevó pagando en caja física con el mismo teléfono.
  async getConsumptionReport(storeCustomerId: string, from: Date, to: Date) {
    const storeCustomer = await prisma.storeCustomer.findUnique({ where: { id: storeCustomerId } });
    if (!storeCustomer?.customerId) return { items: [], totalUnits: 0, totalSpent: 0 };

    const grouped = await prisma.saleItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        sale: {
          customerId: storeCustomer.customerId,
          status: { in: ['COMPLETED', 'PARTIALLY_RETURNED'] },
          createdAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true, subtotal: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: 'desc' } },
    });

    const items = grouped.map(g => ({
      productId: g.productId,
      productName: g.productName,
      quantity: Number(g._sum.quantity ?? 0),
      spent: Number(g._sum.subtotal ?? 0),
      timesPurchased: g._count._all,
    }));

    return {
      items,
      totalUnits: items.reduce((s, i) => s + i.quantity, 0),
      totalSpent: items.reduce((s, i) => s + i.spent, 0),
    };
  }

}

export const storeAuthService = new StoreAuthService();
