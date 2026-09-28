import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../database/client';
import { AuthenticationError, BusinessError } from '../../utils/errors';
import { env } from '../../config/env';

const RIDER_JWT_SECRET = env.JWT_SECRET + '_rider';
const TOKEN_EXPIRES = '30d';

export class DeliveryAuthService {
  async login(telefono: string, pin: string) {
    const rider = await prisma.rider.findUnique({ where: { telefono } });
    if (!rider) throw new AuthenticationError('Teléfono o PIN incorrectos.');
    if (rider.status !== 'ACTIVE') throw new BusinessError('Tu cuenta de repartidor está desactivada.');

    const valid = await bcrypt.compare(pin, rider.pinHash);
    if (!valid) throw new AuthenticationError('Teléfono o PIN incorrectos.');

    const token = this.generateToken(rider.id);
    return { rider: this.safeRider(rider), token };
  }

  verifyToken(token: string): string {
    const payload = jwt.verify(token, RIDER_JWT_SECRET) as { sub: string };
    return payload.sub;
  }

  private generateToken(riderId: string): string {
    return jwt.sign({ sub: riderId }, RIDER_JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
  }

  private safeRider(r: { id: string; nombre: string; telefono: string }) {
    return { id: r.id, nombre: r.nombre, telefono: r.telefono };
  }
}

export const deliveryAuthService = new DeliveryAuthService();
