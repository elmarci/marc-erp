import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { env } from '../../config/env';

const CUSTOMER_JWT_SECRET = env.JWT_SECRET + '_customer';
const TOKEN_EXPIRES = '30d';
const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

export class StoreAuthService {
  // Busca un Customer del ERP por teléfono; si no existe lo crea. Así toda
  // cuenta de la tienda online tiene su espejo en el módulo Clientes del ERP
  // — mismo teléfono, mismo historial de compras, mismos puntos.
  private async findOrCreateErpCustomer(name: string, phone: string, email?: string) {
    const existing = await prisma.customer.findFirst({ where: { phone } });
    if (existing) return existing.id;

    const [firstName, ...rest] = name.trim().split(/\s+/);
    const created = await prisma.customer.create({
      data: {
        firstName: firstName || name,
        lastName: rest.join(' ') || null,
        phone, email,
        type: 'REGULAR',
        notes: 'Creado automáticamente al registrarse en la tienda online.',
      },
    });
    return created.id;
  }

  async register(data: {
    name: string; phone: string; email?: string; password: string;
  }) {
    const existingPhone = await prisma.storeCustomer.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new BusinessError('Ya existe una cuenta con ese teléfono.');

    if (data.email) {
      const existingEmail = await prisma.storeCustomer.findUnique({ where: { email: data.email } });
      if (existingEmail) throw new BusinessError('Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const customerId = await this.findOrCreateErpCustomer(data.name, data.phone, data.email);
    const customer = await prisma.storeCustomer.create({
      data: { name: data.name, phone: data.phone, email: data.email, passwordHash, customerId },
    });

    const token = this.generateToken(customer.id);
    return { customer: this.safeCustomer(customer), token };
  }

  async login(identifier: string, password: string) {
    // Login by phone or email
    const customer = await prisma.storeCustomer.findFirst({
      where: {
        OR: [{ phone: identifier }, { email: identifier }],
        isActive: true,
      },
    });
    if (!customer) throw new BusinessError('Teléfono/correo o contraseña incorrectos.');
    if (!customer.passwordHash) throw new BusinessError('Esta cuenta se creó con Google. Ingresa con el botón de Google.');

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) throw new BusinessError('Teléfono/correo o contraseña incorrectos.');

    // Backfill: cuentas creadas antes de vincularse con el ERP todavía no
    // tienen customerId — se enlazan la primera vez que inician sesión.
    if (!customer.customerId) {
      const customerId = await this.findOrCreateErpCustomer(customer.name, customer.phone, customer.email ?? undefined);
      await prisma.storeCustomer.update({ where: { id: customer.id }, data: { customerId } });
      customer.customerId = customerId;
    }

    const token = this.generateToken(customer.id);
    return { customer: this.safeCustomer(customer), token };
  }

  // Login/registro con Google. Google sólo confirma el email — nunca lo
  // usamos para asumir nombre ni teléfono. Cuando se está creando una
  // cuenta nueva, `phone` y `name` son obligatorios y los llena la persona
  // misma (NEEDS_PROFILE le pide el formulario antes de reintentar con el
  // mismo idToken).
  async loginWithGoogle(idToken: string, phone?: string, name?: string) {
    if (!googleClient) throw new BusinessError('El login con Google no está configurado todavía.');

    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new BusinessError('No se pudo verificar la cuenta de Google.');

    let customer = await prisma.storeCustomer.findUnique({ where: { googleId: payload.sub } });

    if (!customer) {
      const byEmail = await prisma.storeCustomer.findUnique({ where: { email: payload.email } });
      if (byEmail) {
        customer = await prisma.storeCustomer.update({ where: { id: byEmail.id }, data: { googleId: payload.sub } });
      } else {
        if (!phone?.trim() || !name?.trim()) throw new BusinessError('NEEDS_PROFILE');
        const existingPhone = await prisma.storeCustomer.findUnique({ where: { phone } });
        if (existingPhone) throw new BusinessError('Ya existe una cuenta con ese teléfono.');

        const customerId = await this.findOrCreateErpCustomer(name.trim(), phone, payload.email);
        customer = await prisma.storeCustomer.create({
          data: {
            name: name.trim(), phone, email: payload.email, googleId: payload.sub,
            authProvider: 'GOOGLE', customerId,
          },
        });
      }
    }

    if (!customer.isActive) throw new BusinessError('Esta cuenta está desactivada.');

    if (!customer.customerId) {
      const customerId = await this.findOrCreateErpCustomer(customer.name, customer.phone, customer.email ?? undefined);
      customer = await prisma.storeCustomer.update({ where: { id: customer.id }, data: { customerId } });
    }

    const token = this.generateToken(customer.id);
    return { customer: this.safeCustomer(customer), token };
  }

  async getProfile(customerId: string) {
    const customer = await prisma.storeCustomer.findUnique({
      where: { id: customerId },
      include: {
        addresses: { orderBy: { isDefault: 'desc' } },
        customer: { select: { loyaltyPoints: true } },
      },
    });
    if (!customer) throw new NotFoundError('Cliente');
    return {
      ...this.safeCustomer(customer),
      addresses: customer.addresses,
      loyaltyPoints: customer.customer?.loyaltyPoints ?? 0,
    };
  }

  async updateProfile(customerId: string, data: { name?: string; email?: string }) {
    const customer = await prisma.storeCustomer.update({
      where: { id: customerId },
      data,
    });
    return this.safeCustomer(customer);
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

  verifyToken(token: string): string {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET) as { sub: string };
    return payload.sub;
  }

  private generateToken(customerId: string): string {
    return jwt.sign({ sub: customerId }, CUSTOMER_JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
  }

  private safeCustomer(c: { id: string; name: string; phone: string; email: string | null; createdAt: Date }) {
    return { id: c.id, name: c.name, phone: c.phone, email: c.email, createdAt: c.createdAt };
  }
}

export const storeAuthService = new StoreAuthService();
