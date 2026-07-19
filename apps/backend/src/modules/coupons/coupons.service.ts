import { prisma } from '../../database/client';
import { BusinessError, NotFoundError } from '../../utils/errors';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin O/0/I/1 — ambiguos al imprimir
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `DESC-${code}`;
}

export class CouponsService {
  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const existing = await prisma.coupon.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new BusinessError('No se pudo generar un código de cupón único. Intente de nuevo.');
  }

  /** Valida un cupón para un cliente sin canjearlo (previsualización en el POS). */
  async validate(code: string, customerId: string) {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!coupon) throw new NotFoundError('Cupón');
    if (coupon.customerId !== customerId) {
      throw new BusinessError('Este cupón pertenece a otro cliente.');
    }
    if (coupon.status === 'REDEEMED') {
      throw new BusinessError('Este cupón ya fue canjeado.');
    }
    if (coupon.status === 'EXPIRED' || coupon.expiresAt < new Date()) {
      throw new BusinessError('Este cupón ya venció.');
    }
    return coupon;
  }

  async listForCustomer(customerId: string) {
    const now = new Date();
    // Marca como vencidos los que ya pasaron su fecha (housekeeping perezoso)
    await prisma.coupon.updateMany({
      where: { customerId, status: 'ACTIVE', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    return prisma.coupon.findMany({
      where: { customerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const couponsService = new CouponsService();
