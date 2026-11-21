import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../database/client';
import { env } from '../../config/env';
import { AuthenticationError, BusinessError, NotFoundError } from '../../utils/errors';

const RIDER_JWT_SECRET = env.JWT_SECRET + '_rider';
const TOKEN_EXPIRES = '30d';

// Seguridad del ingreso de repartidores:
// - cada repartidor queda atado a UN celular (secreto aleatorio que guarda la
//   app; aquí solo su hash). Un celular nuevo necesita un código de un solo
//   uso que genera el ERP y vence en 10 minutos;
// - 5 PIN errados seguidos bloquean 15 minutos y quedan registrados;
// - el token lleva la versión de sesión y el celular: desactivar, cerrar
//   sesiones o quitar el celular lo invalida en la siguiente petición.
const MAX_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 3;

type RiderRow = NonNullable<Awaited<ReturnType<typeof prisma.rider.findUnique>>>;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hashCode = (riderId: string, code: string) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`${riderId}:${code}`).digest('hex');

export const isValidPin = (pin: string) => /^\d{6}$/.test(pin);

export interface RiderSession { riderId: string; deviceId: string }

export class DeliveryAuthService {
  /** Revisa bloqueo y PIN, contando los errores. Devuelve el repartidor si el PIN es correcto. */
  private async checkPin(telefono: string, pin: string, dispositivo: string, ip?: string): Promise<RiderRow> {
    const rider = await prisma.rider.findUnique({ where: { telefono } });
    if (!rider) throw new AuthenticationError('Celular o PIN incorrectos.');
    if (rider.status !== 'ACTIVE') throw new BusinessError('Tu cuenta de repartidor está desactivada. Habla con la tienda.', 'RIDER_INACTIVE');

    if (rider.lockedUntil && rider.lockedUntil > new Date()) {
      const min = Math.ceil((rider.lockedUntil.getTime() - Date.now()) / 60000);
      throw new BusinessError(`Cuenta bloqueada por intentos fallidos. Vuelve a intentar en ${min} min o pide ayuda a la tienda.`, 'RIDER_LOCKED');
    }

    const valid = await bcrypt.compare(pin, rider.pinHash);
    if (!valid) {
      const fails = rider.failedPinAttempts + 1;
      const lock = fails >= MAX_PIN_ATTEMPTS;
      await prisma.$transaction([
        prisma.rider.update({
          where: { id: rider.id },
          data: lock
            ? { failedPinAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
            : { failedPinAttempts: fails },
        }),
        prisma.riderLoginAttempt.create({
          data: { riderId: rider.id, motivo: lock ? `${MAX_PIN_ATTEMPTS} PIN errados · bloqueado ${LOCK_MINUTES} min` : 'PIN errado', dispositivo, ip },
        }),
      ]);
      if (lock) throw new BusinessError(`Cuenta bloqueada ${LOCK_MINUTES} minutos por intentos fallidos.`, 'RIDER_LOCKED');
      const left = MAX_PIN_ATTEMPTS - fails;
      throw new AuthenticationError(`Celular o PIN incorrectos. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`);
    }

    if (rider.failedPinAttempts > 0 || rider.lockedUntil) {
      await prisma.rider.update({ where: { id: rider.id }, data: { failedPinAttempts: 0, lockedUntil: null } });
    }
    return rider;
  }

  async login(telefono: string, pin: string, deviceSecret: string, dispositivo: string, ip?: string) {
    const rider = await this.checkPin(telefono, pin, dispositivo, ip);
    const device = await prisma.riderDevice.findUnique({ where: { secretHash: sha256(deviceSecret) } });
    if (!device || device.riderId !== rider.id || device.revokedAt) {
      await prisma.riderLoginAttempt.create({ data: { riderId: rider.id, motivo: 'Celular no autorizado', dispositivo, ip } });
      throw new BusinessError('Este celular aún no está autorizado para tu cuenta.', 'DEVICE_NOT_AUTHORIZED');
    }
    await prisma.riderDevice.update({ where: { id: device.id }, data: { lastLoginAt: new Date() } });
    return this.session(rider, device.id);
  }

  /** Autoriza este celular con el código de la tienda. Revoca el celular anterior. */
  async activate(telefono: string, pin: string, deviceSecret: string, code: string, dispositivo: string, ip?: string) {
    const rider = await this.checkPin(telefono, pin, dispositivo, ip);
    const pending = await prisma.riderActivationCode.findFirst({
      where: { riderId: rider.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) throw new BusinessError('El código venció o no existe. Pide uno nuevo en la tienda.', 'CODE_INVALID');

    const ok = crypto.timingSafeEqual(Buffer.from(pending.codeHash), Buffer.from(hashCode(rider.id, code)));
    if (!ok) {
      const attempts = pending.attempts + 1;
      await prisma.$transaction([
        prisma.riderActivationCode.update({
          where: { id: pending.id },
          data: { attempts, ...(attempts >= MAX_CODE_ATTEMPTS ? { usedAt: new Date() } : {}) },
        }),
        prisma.riderLoginAttempt.create({ data: { riderId: rider.id, motivo: 'Código de activación errado', dispositivo, ip } }),
      ]);
      const left = MAX_CODE_ATTEMPTS - attempts;
      throw new BusinessError(
        left > 0 ? `Código incorrecto. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.` : 'Código incorrecto. Pide uno nuevo en la tienda.',
        'CODE_INVALID',
      );
    }

    const now = new Date();
    const [, , device, updated] = await prisma.$transaction([
      prisma.riderActivationCode.update({ where: { id: pending.id }, data: { usedAt: now } }),
      prisma.riderDevice.updateMany({ where: { riderId: rider.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.riderDevice.create({ data: { riderId: rider.id, secretHash: sha256(deviceSecret), label: dispositivo.slice(0, 80), lastLoginAt: now } }),
      prisma.rider.update({ where: { id: rider.id }, data: { tokenVersion: { increment: 1 } } }),
    ]);
    return this.session(updated, device.id);
  }

  async changePin(riderId: string, currentPin: string, newPin: string) {
    if (!isValidPin(newPin)) throw new BusinessError('El PIN nuevo debe tener 6 dígitos.');
    if (/^(\d)\1{5}$/.test(newPin) || ['123456', '654321', '012345'].includes(newPin)) {
      throw new BusinessError('Ese PIN es muy fácil de adivinar. Elige otro.');
    }
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundError('Repartidor');
    if (!(await bcrypt.compare(currentPin, rider.pinHash))) throw new BusinessError('Tu PIN actual no es correcto.');
    await prisma.rider.update({ where: { id: riderId }, data: { pinHash: await bcrypt.hash(newPin, env.BCRYPT_ROUNDS), pinLength: 6 } });
  }

  /** Valida el token contra la versión de sesión y el celular autorizado. */
  async verifyToken(token: string): Promise<RiderSession | null> {
    let payload: { sub?: string; ver?: number; did?: string };
    try { payload = jwt.verify(token, RIDER_JWT_SECRET) as typeof payload; } catch { return null; }
    if (!payload.sub || typeof payload.ver !== 'number' || !payload.did) return null; // tokens antiguos: volver a ingresar
    const device = await prisma.riderDevice.findUnique({
      where: { id: payload.did },
      select: { riderId: true, revokedAt: true, rider: { select: { status: true, tokenVersion: true } } },
    });
    if (!device || device.revokedAt || device.riderId !== payload.sub) return null;
    if (device.rider.status !== 'ACTIVE' || device.rider.tokenVersion !== payload.ver) return null;
    return { riderId: payload.sub, deviceId: payload.did };
  }

  private session(rider: RiderRow, deviceId: string) {
    const token = jwt.sign({ sub: rider.id, ver: rider.tokenVersion, did: deviceId }, RIDER_JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
    return { rider: this.safeRider(rider), token, pinUpgradeRequired: rider.pinLength !== 6 };
  }

  private safeRider(rider: RiderRow) {
    const { pinHash: _pinHash, ...safe } = rider;
    return safe;
  }

  /* ── Admin (ERP) ─────────────────────────────────────────────────────── */

  async createActivationCode(riderId: string, userId: string) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundError('Repartidor');
    if (rider.status !== 'ACTIVE') throw new BusinessError('Activa al repartidor antes de autorizar un celular.');
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60000);
    await prisma.$transaction([
      prisma.riderActivationCode.updateMany({ where: { riderId, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.riderActivationCode.create({ data: { riderId, codeHash: hashCode(riderId, code), expiresAt, createdById: userId } }),
    ]);
    return { code, expiresAt };
  }

  async getSecurity(riderId: string) {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      select: {
        lockedUntil: true, pinLength: true,
        devices: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, label: true, createdAt: true, lastLoginAt: true } },
        loginAttempts: { orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, motivo: true, dispositivo: true, createdAt: true } },
      },
    });
    if (!rider) throw new NotFoundError('Repartidor');
    return {
      bloqueadoHasta: rider.lockedUntil && rider.lockedUntil > new Date() ? rider.lockedUntil : null,
      pinSeguro: rider.pinLength === 6,
      celulares: rider.devices,
      intentos: rider.loginAttempts,
    };
  }

  async revokeDevice(riderId: string, deviceId: string) {
    const res = await prisma.riderDevice.updateMany({ where: { id: deviceId, riderId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (res.count === 0) throw new NotFoundError('Celular');
  }

  async closeSessions(riderId: string) {
    await prisma.rider.update({ where: { id: riderId }, data: { tokenVersion: { increment: 1 }, enServicio: false } });
  }

  async unlock(riderId: string) {
    await prisma.rider.update({ where: { id: riderId }, data: { lockedUntil: null, failedPinAttempts: 0 } });
  }
}

export const deliveryAuthService = new DeliveryAuthService();
