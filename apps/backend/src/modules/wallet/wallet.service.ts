import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { emitEvent } from '../../config/socket';
import { BusinessError, NotFoundError } from '../../utils/errors';
import { nowInLima } from '../../utils/timezone';
import { treasuryService, methodToAccount } from '../treasury/treasury.service';

// =============================================================================
// Saldo prepago (monedero) por cliente.
//
// Regla de oro: el saldo (Customer.walletBalance) SOLO cambia a través de
// applyMovement, que en la misma transacción deja su fila en WalletMovement
// con el saldo resultante. Así el historial siempre cuadra con el saldo y
// nunca puede quedar negativo (la resta es condicional, a prueba de dos
// compras simultáneas).
// =============================================================================

export type WalletMovementType = 'CARGA' | 'CONSUMO' | 'DEVOLUCION' | 'AJUSTE';
export type WalletOrigin = 'PAGO' | 'BENEFICIO' | 'MENSUAL' | 'ONLINE';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Código del QR para pagar con saldo en el POS: vive pocos minutos en Redis.
const QR_TTL_SECONDS = 5 * 60;
const QR_PREFIX = 'MARC-SALDO-';
// Autorización que entrega el POS al verificar al cliente (QR o PIN) y que la
// venta debe traer para poder cobrar con saldo.
const AUTH_TTL_SECONDS = 15 * 60;

export function customerDisplayName(c: { firstName: string; lastName: string | null; businessName: string | null }) {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.businessName || 'Cliente';
}

class WalletService {
  /**
   * Único punto que modifica el saldo. amount con signo: + entra, - sale.
   * Si es una salida y no hay saldo suficiente, lanza BusinessError y la
   * transacción completa se revierte.
   */
  async applyMovement(
    tx: Prisma.TransactionClient,
    input: {
      customerId: string;
      amount: number;
      type: WalletMovementType;
      origin?: WalletOrigin | null;
      method?: string | null;
      description: string;
      saleId?: string | null;
      storeOrderId?: string | null;
      topupId?: string | null;
      userId?: string | null;
    },
  ) {
    const amount = round2(input.amount);
    if (amount === 0) throw new BusinessError('El monto debe ser distinto de 0.');

    if (amount < 0) {
      const res = await tx.customer.updateMany({
        where: { id: input.customerId, walletBalance: { gte: -amount } },
        data: { walletBalance: { increment: amount } },
      });
      if (res.count !== 1) {
        const c = await tx.customer.findUnique({ where: { id: input.customerId }, select: { walletBalance: true } });
        if (!c) throw new NotFoundError('Cliente');
        throw new BusinessError(`Saldo insuficiente. Disponible: S/ ${Number(c.walletBalance).toFixed(2)}.`);
      }
    } else {
      await tx.customer.update({ where: { id: input.customerId }, data: { walletBalance: { increment: amount } } });
    }

    const after = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { walletBalance: true } });
    return tx.walletMovement.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        origin: input.origin ?? null,
        amount,
        balanceAfter: after.walletBalance,
        method: input.method ?? null,
        description: input.description,
        saleId: input.saleId ?? null,
        storeOrderId: input.storeOrderId ?? null,
        topupId: input.topupId ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  /**
   * Si la recarga fue pagada, el dinero entra igual que un cobro de deuda:
   * efectivo con caja abierta → movimiento de esa caja (cuadra al cierre);
   * Yape/Plin o sin caja → directo a Caja General.
   */
  private async recordIncome(
    tx: Prisma.TransactionClient,
    amount: number,
    method: string,
    description: string,
    userId: string,
    customerId: string,
    cashSessionId?: string,
  ): Promise<boolean> {
    if (method === 'CASH' && cashSessionId) {
      const session = await tx.cashSession.findFirst({ where: { id: cashSessionId, status: 'OPEN' } });
      if (session) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: session.id, type: 'DEPOSIT', amount, reason: description,
            referenceType: 'WALLET_TOPUP', referenceId: customerId,
          },
        });
        return false;
      }
    }
    await treasuryService.recordMovementInTx(
      tx, 'DEPOSIT', amount, description, userId, 'WALLET_TOPUP', customerId, methodToAccount(method),
    );
    return true;
  }

  // ── Consultas ─────────────────────────────────────────────────────────────

  async getSummary(customerId: string, limit = 50) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, businessName: true, phone: true,
        walletBalance: true, walletPinHash: true, walletRecurring: true,
      },
    });
    if (!customer) throw new NotFoundError('Cliente');
    const movements = await prisma.walletMovement.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const { walletPinHash, ...rest } = customer;
    return {
      ...rest,
      walletBalance: Number(customer.walletBalance),
      hasPin: !!walletPinHash,
      walletRecurring: customer.walletRecurring
        ? { ...customer.walletRecurring, amount: Number(customer.walletRecurring.amount) }
        : null,
      movements: movements.map((m) => ({
        ...m,
        amount: Number(m.amount),
        balanceAfter: Number(m.balanceAfter),
        userName: m.user ? `${m.user.firstName} ${m.user.lastName ?? ''}`.trim() : null,
      })),
    };
  }

  /** Clientes con saldo o con recarga mensual — para la pantalla del ERP. */
  async listWallets() {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null, OR: [{ walletBalance: { gt: 0 } }, { walletRecurring: { isNot: null } }, { walletMovements: { some: {} } }] },
      select: {
        id: true, firstName: true, lastName: true, businessName: true, phone: true, taxId: true,
        walletBalance: true, walletRecurring: true,
      },
      orderBy: { walletBalance: 'desc' },
    });
    return customers.map((c) => ({
      ...c,
      walletBalance: Number(c.walletBalance),
      walletRecurring: c.walletRecurring ? { ...c.walletRecurring, amount: Number(c.walletRecurring.amount) } : null,
    }));
  }

  // ── Operaciones del admin ────────────────────────────────────────────────

  async adminCharge(customerId: string, input: {
    amount: number;
    origin: 'PAGO' | 'BENEFICIO';
    method?: string;
    cashSessionId?: string;
    notes?: string;
  }, userId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Cliente');
    if (input.origin === 'PAGO' && !input.method) throw new BusinessError('Indica con qué pagó la recarga.');
    const name = customerDisplayName(customer);
    const description = input.origin === 'PAGO'
      ? `Recarga pagada (${input.method})${input.notes ? ` — ${input.notes}` : ''}`
      : `Saldo de beneficio${input.notes ? ` — ${input.notes}` : ''}`;

    let toTreasury = false;
    const movement = await prisma.$transaction(async (tx) => {
      const m = await this.applyMovement(tx, {
        customerId, amount: input.amount, type: 'CARGA', origin: input.origin,
        method: input.origin === 'PAGO' ? input.method : null, description, userId,
      });
      if (input.origin === 'PAGO') {
        toTreasury = await this.recordIncome(tx, input.amount, input.method!, `Recarga de saldo (${name})`, userId, customerId, input.cashSessionId);
      }
      return m;
    });
    if (toTreasury) emitEvent('erp:cash-updated');
    return movement;
  }

  async adminDebit(customerId: string, input: { amount: number; reason: string }, userId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Cliente');
    return prisma.$transaction((tx) => this.applyMovement(tx, {
      customerId, amount: -input.amount, type: 'AJUSTE', description: `Descuento manual — ${input.reason}`, userId,
    }));
  }

  async setRecurring(customerId: string, input: { amount: number; dayOfMonth: number; isActive: boolean }, userId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new NotFoundError('Cliente');
    const { year, month, day } = nowInLima();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const existing = await prisma.walletRecurring.findUnique({ where: { customerId } });
    // Al crearla, si el día de este mes ya pasó no se carga en retroactivo:
    // la primera recarga automática es el próximo mes (el admin puede cargar
    // a mano lo de este mes si quiere).
    const lastPeriod = existing ? existing.lastPeriod : (day >= input.dayOfMonth ? period : null);
    return prisma.walletRecurring.upsert({
      where: { customerId },
      create: { customerId, amount: input.amount, dayOfMonth: input.dayOfMonth, isActive: input.isActive, lastPeriod, createdById: userId },
      update: { amount: input.amount, dayOfMonth: input.dayOfMonth, isActive: input.isActive },
    });
  }

  async deleteRecurring(customerId: string) {
    await prisma.walletRecurring.deleteMany({ where: { customerId } });
  }

  /**
   * Recargas mensuales automáticas. Lo llama server.ts al iniciar y cada
   * hora. Es idempotente: el updateMany sobre lastPeriod garantiza que cada
   * recarga se aplique una sola vez por mes aunque haya dos procesos.
   */
  async processRecurring() {
    const { year, month, day } = nowInLima();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const due = await prisma.walletRecurring.findMany({
      where: {
        isActive: true,
        dayOfMonth: { lte: day },
        OR: [{ lastPeriod: null }, { lastPeriod: { not: period } }],
        customer: { deletedAt: null },
      },
    });
    let applied = 0;
    for (const r of due) {
      try {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.walletRecurring.updateMany({
            where: { id: r.id, OR: [{ lastPeriod: null }, { lastPeriod: { not: period } }] },
            data: { lastPeriod: period },
          });
          if (claim.count !== 1) return;
          await this.applyMovement(tx, {
            customerId: r.customerId, amount: Number(r.amount), type: 'CARGA', origin: 'MENSUAL',
            description: `Recarga mensual ${period}`,
          });
          applied++;
        });
      } catch (err) {
        logger.error({ err, recurringId: r.id }, 'Error al aplicar recarga mensual de saldo');
      }
    }
    if (applied > 0) logger.info({ applied, period }, 'Recargas mensuales de saldo aplicadas');
    return applied;
  }

  // ── Recargas online (Yape) ───────────────────────────────────────────────

  async requestTopup(customerId: string, input: { amount: number; operationNumber: string }) {
    const pending = await prisma.walletTopupRequest.count({ where: { customerId, status: 'PENDING' } });
    if (pending >= 3) throw new BusinessError('Ya tienes recargas pendientes de verificar. Espera a que las revisemos.');
    const dup = await prisma.walletTopupRequest.findFirst({
      where: { operationNumber: input.operationNumber, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (dup) throw new BusinessError('Ese número de operación ya fue registrado.');
    const req = await prisma.walletTopupRequest.create({
      data: { customerId, amount: input.amount, operationNumber: input.operationNumber, method: 'YAPE' },
    });
    emitEvent('erp:wallet-topup-requested', { id: req.id, amount: Number(req.amount) });
    return req;
  }

  async listTopups(status?: string) {
    const rows = await prisma.walletTopupRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, businessName: true, phone: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  }

  async listCustomerTopups(customerId: string) {
    const rows = await prisma.walletTopupRequest.findMany({
      where: { customerId }, orderBy: { createdAt: 'desc' }, take: 10,
    });
    return rows.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, operationNumber: r.operationNumber, rejectReason: r.rejectReason, createdAt: r.createdAt }));
  }

  async approveTopup(id: string, userId: string) {
    const req = await prisma.walletTopupRequest.findUnique({ where: { id }, include: { customer: true } });
    if (!req) throw new NotFoundError('Solicitud de recarga');
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.walletTopupRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: userId, reviewedAt: new Date() },
      });
      if (claim.count !== 1) throw new BusinessError('Esta solicitud ya fue revisada.');
      const m = await this.applyMovement(tx, {
        customerId: req.customerId, amount: Number(req.amount), type: 'CARGA', origin: 'ONLINE', method: req.method,
        description: `Recarga por ${req.method} (op. ${req.operationNumber})`, topupId: id, userId,
      });
      await this.recordIncome(tx, Number(req.amount), req.method, `Recarga de saldo online (${customerDisplayName(req.customer)})`, userId, req.customerId);
      return m;
    });
    emitEvent('erp:cash-updated');
    return result;
  }

  async rejectTopup(id: string, reason: string, userId: string) {
    const claim = await prisma.walletTopupRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, reviewedById: userId, reviewedAt: new Date() },
    });
    if (claim.count !== 1) throw new BusinessError('Esta solicitud ya fue revisada.');
  }

  // ── Pago con saldo en el POS (QR o PIN) ─────────────────────────────────

  async setPin(customerId: string, pin: string) {
    const hash = await bcrypt.hash(pin, env.BCRYPT_ROUNDS);
    await prisma.customer.update({ where: { id: customerId }, data: { walletPinHash: hash } });
  }

  /** El cliente pide un QR desde su perfil de la tienda. */
  async createQrCode(customerId: string) {
    const code = QR_PREFIX + crypto.randomBytes(6).toString('hex').toUpperCase();
    await redis.set(`wallet:qr:${code}`, customerId, 'EX', QR_TTL_SECONDS);
    return { code, expiresIn: QR_TTL_SECONDS };
  }

  private async issueAuth(customerId: string) {
    const token = crypto.randomBytes(16).toString('hex');
    await redis.set(`wallet:auth:${token}`, customerId, 'EX', AUTH_TTL_SECONDS);
    const c = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { id: true, firstName: true, lastName: true, businessName: true, phone: true, taxId: true, walletBalance: true, loyaltyPoints: true, type: true, creditLimit: true, currentBalance: true },
    });
    return {
      walletAuthToken: token,
      customer: { ...c, walletBalance: Number(c.walletBalance), creditLimit: Number(c.creditLimit), currentBalance: Number(c.currentBalance), name: customerDisplayName(c) },
    };
  }

  /** El POS escanea el QR del cliente. El código sirve una sola vez. */
  async verifyQr(code: string) {
    const clean = code.trim().toUpperCase();
    if (!clean.startsWith(QR_PREFIX)) throw new BusinessError('Ese código no es un QR de saldo MARC.');
    const customerId = await redis.getdel(`wallet:qr:${clean}`);
    if (!customerId) throw new BusinessError('El QR venció o ya fue usado. Pide al cliente que lo genere de nuevo.');
    return this.issueAuth(customerId);
  }

  /** Sin celular: el cajero elige al cliente y este dicta su PIN. */
  async verifyPin(customerId: string, pin: string) {
    const attemptsKey = `wallet:pin-fail:${customerId}`;
    const fails = Number(await redis.get(attemptsKey) ?? 0);
    if (fails >= 5) throw new BusinessError('Demasiados intentos con PIN. Espera 15 minutos o usa el QR.');
    const c = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { walletPinHash: true } });
    if (!c) throw new NotFoundError('Cliente');
    if (!c.walletPinHash) throw new BusinessError('Este cliente no tiene PIN. Puede crearlo en su perfil de la tienda o pagar con QR.');
    const ok = await bcrypt.compare(pin, c.walletPinHash);
    if (!ok) {
      await redis.multi().incr(attemptsKey).expire(attemptsKey, 15 * 60).exec();
      throw new BusinessError('PIN incorrecto.');
    }
    await redis.del(attemptsKey);
    return this.issueAuth(customerId);
  }

  /** La venta del POS valida la autorización antes de cobrar... */
  async checkAuth(token: string | undefined, customerId: string | undefined | null) {
    if (!token || !customerId) throw new BusinessError('Para cobrar con saldo, verifica al cliente con su QR o PIN.');
    const owner = await redis.get(`wallet:auth:${token}`);
    if (!owner || owner !== customerId) {
      throw new BusinessError('La verificación del saldo venció. Vuelve a escanear el QR o pedir el PIN.');
    }
  }

  /** ...y la gasta recién cuando la venta quedó grabada (sirve una vez). */
  async consumeAuth(token: string) {
    await redis.del(`wallet:auth:${token}`).catch(() => {});
  }

  // ── Reversiones ──────────────────────────────────────────────────────────

  /** Pedido web cancelado antes de confirmarse: el saldo usado vuelve. */
  async refundStoreOrder(tx: Prisma.TransactionClient, order: { id: string; orderNumber: string; walletAmount: Prisma.Decimal | number }, customerId: string) {
    const amount = Number(order.walletAmount);
    if (amount <= 0) return;
    const already = await tx.walletMovement.findFirst({ where: { storeOrderId: order.id, type: 'DEVOLUCION' } });
    if (already) return;
    await this.applyMovement(tx, {
      customerId, amount, type: 'DEVOLUCION', description: `Pedido ${order.orderNumber} cancelado`, storeOrderId: order.id,
    });
  }

  /** Venta anulada: lo pagado con saldo vuelve al cliente. */
  async refundSale(tx: Prisma.TransactionClient, sale: { id: string; saleNumber: string; customerId: string | null }, amount: number, reason: string, userId: string) {
    if (amount <= 0) return;
    if (!sale.customerId) throw new BusinessError('La venta no tiene cliente: no hay a quién devolverle el saldo.');
    await this.applyMovement(tx, {
      customerId: sale.customerId, amount, type: 'DEVOLUCION', description: `${reason} ${sale.saleNumber}`, saleId: sale.id, userId,
    });
  }
}

export const walletService = new WalletService();
