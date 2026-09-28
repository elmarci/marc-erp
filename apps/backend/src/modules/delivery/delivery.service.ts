import bcrypt from 'bcrypt';
import { prisma } from '../../database/client';
import { NotFoundError, BusinessError, AuthorizationError } from '../../utils/errors';
import { emitEvent } from '../../config/socket';
import { env } from '../../config/env';
import { pushService } from '../push/push.service';
import { haversineKm, STORE_ORIGIN, tarifaParaPedido } from './economics';
import type { StoreOrder } from '@prisma/client';

// Bolsa de disponibles: solo pedidos DELIVERY (un PICKUP nunca lo reparte un
// biker), ya aprobados por el ERP y todavía sin repartidor.
const POOL_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'];

const orderWithItems = { items: true } as const;

function toDeliveryOrderJSON(order: StoreOrder & { items: { name: string; quantity: unknown }[] }) {
  const hasGps = order.latitude != null && order.longitude != null;
  const coords = hasGps ? { lat: order.latitude as number, lng: order.longitude as number } : STORE_ORIGIN;
  const distanciaKm = hasGps ? haversineKm(STORE_ORIGIN, coords) : 0;
  const contraEntrega = order.paymentMethod === 'CASH' || order.paymentMethod === 'YAPE_CONTRAENTREGA';
  const metodoPago = !contraEntrega ? 'Pagado online' : order.paymentMethod === 'CASH' ? 'Efectivo' : 'Yape';

  let status: 'DISPONIBLE' | 'ASIGNADO' | 'RECOGIDO' | 'EN_CAMINO' | 'ENTREGADO' = 'DISPONIBLE';
  if (order.deliveryStatus === 'ASIGNADO') status = 'ASIGNADO';
  else if (order.deliveryStatus === 'RECOGIDO') status = 'RECOGIDO';
  else if (order.deliveryStatus === 'EN_CAMINO') status = 'EN_CAMINO';
  else if (order.deliveryStatus === 'ENTREGADO') status = 'ENTREGADO';

  const tarifaReparto = order.tarifaReparto != null ? Number(order.tarifaReparto) : tarifaParaPedido(order);
  const asignadoAt = (order.claimedAt ?? order.createdAt).toISOString();
  const esperaMin = Math.max(0, Math.round((Date.now() - order.createdAt.getTime()) / 60000));
  const isNew = order.riderId == null && Date.now() - order.updatedAt.getTime() < 10 * 60 * 1000;

  return {
    id: order.id,
    numero: '#' + order.orderNumber.replace(/^ORD-0*/, ''),
    status,
    direccion: order.address ?? '',
    referencia: order.reference ?? '',
    distanciaKm: Math.round(distanciaKm * 10) / 10,
    lat: coords.lat,
    lng: coords.lng,
    esperaMin,
    clienteNombre: order.customerName,
    clienteTelefono: order.customerPhone,
    items: order.items.map((i) => ({ nombre: i.name, cantidad: Number(i.quantity) })),
    paquete: {
      tamano: order.packageTamano as 'chico' | 'mediano' | 'grande',
      tipo: order.packageTipo as 'bolsa' | 'caja' | 'bulto',
      pesoKg: order.packagePesoKg,
      fragil: order.packageFragil,
    },
    contraEntrega,
    monto: Number(order.total),
    metodoPago,
    tarifaReparto,
    isNew,
    asignadoAt,
    entregadoAt: order.deliveredAt?.toISOString(),
    duracionMin: order.deliveredAt && order.claimedAt
      ? Math.max(1, Math.round((order.deliveredAt.getTime() - order.claimedAt.getTime()) / 60000))
      : undefined,
  };
}

export class DeliveryService {
  /* ── Pedidos ──────────────────────────────────────────────────────────── */

  async getAvailableOrders() {
    const orders = await prisma.storeOrder.findMany({
      where: { status: { in: POOL_STATUSES }, deliveryType: 'DELIVERY', riderId: null },
      include: orderWithItems,
      orderBy: { createdAt: 'asc' },
    });
    return orders.map(toDeliveryOrderJSON);
  }

  async getMyOrders(riderId: string) {
    const orders = await prisma.storeOrder.findMany({
      where: { riderId, deliveryStatus: { in: ['ASIGNADO', 'RECOGIDO', 'EN_CAMINO'] } },
      include: orderWithItems,
      orderBy: { claimedAt: 'asc' },
    });
    return orders.map(toDeliveryOrderJSON);
  }

  async getHistory(riderId: string) {
    const orders = await prisma.storeOrder.findMany({
      where: { riderId, deliveryStatus: 'ENTREGADO' },
      include: orderWithItems,
      orderBy: { deliveredAt: 'desc' },
    });
    return orders.map(toDeliveryOrderJSON);
  }

  async getOrder(riderId: string, id: string) {
    const order = await prisma.storeOrder.findUnique({ where: { id }, include: orderWithItems });
    if (!order) throw new NotFoundError('Pedido');
    const inPool = order.riderId == null && POOL_STATUSES.includes(order.status) && order.deliveryType === 'DELIVERY';
    if (order.riderId !== riderId && !inPool) throw new AuthorizationError('Este pedido no te pertenece.');
    return toDeliveryOrderJSON(order);
  }

  // Atómico: solo asigna si sigue sin dueño — evita que dos bikers se lleven
  // el mismo pedido si lo tocan casi al mismo tiempo.
  async claimOrder(riderId: string, id: string) {
    const order = await prisma.storeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Pedido');
    if (!POOL_STATUSES.includes(order.status) || order.deliveryType !== 'DELIVERY') {
      throw new BusinessError('Este pedido ya no está disponible.');
    }
    const tarifaReparto = tarifaParaPedido(order);
    const result = await prisma.storeOrder.updateMany({
      where: { id, riderId: null },
      data: { riderId, deliveryStatus: 'ASIGNADO', claimedAt: new Date(), tarifaReparto },
    });
    if (result.count === 0) throw new BusinessError('Ya fue tomado por otro repartidor.');

    await prisma.deliveryEvent.create({ data: { orderId: id, riderId, type: 'CLAIMED' } });
    emitEvent('delivery:pool-updated');

    return this.getOrder(riderId, id);
  }

  async claimOrders(riderId: string, ids: string[]) {
    const tomados: ReturnType<typeof toDeliveryOrderJSON>[] = [];
    const fallidos: string[] = [];
    for (const id of ids) {
      try {
        tomados.push(await this.claimOrder(riderId, id));
      } catch {
        fallidos.push(id);
      }
    }
    return { tomados, fallidos };
  }

  async releaseOrder(riderId: string, id: string) {
    const order = await prisma.storeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Pedido');
    if (order.riderId !== riderId) throw new AuthorizationError('Este pedido no te pertenece.');
    if (order.deliveryStatus !== 'ASIGNADO') {
      throw new BusinessError('Ya recogiste este pedido, no se puede liberar.');
    }
    await prisma.storeOrder.update({
      where: { id },
      data: { riderId: null, deliveryStatus: null, claimedAt: null, tarifaReparto: null },
    });
    await prisma.deliveryEvent.create({ data: { orderId: id, riderId, type: 'RELEASED' } });
    emitEvent('delivery:pool-updated');
  }

  private static readonly FORWARD: Record<string, string> = {
    ASIGNADO: 'RECOGIDO',
    RECOGIDO: 'EN_CAMINO',
    EN_CAMINO: 'ENTREGADO',
  };

  // Deshacer un paso — el toast "Deshacer" de PedidoDetallePage tiene una
  // ventana de 5s después de avanzar (ASIGNADO→RECOGIDO o RECOGIDO→EN_CAMINO)
  // para revertir sin llamar a la tienda. Nunca se ofrece deshacer después de
  // ENTREGADO (ahí ya se navega a la pantalla de confirmación), así que no
  // hace falta soportar revertir eso ni destocar la liquidación.
  private static readonly BACKWARD: Record<string, string> = {
    RECOGIDO: 'ASIGNADO',
    EN_CAMINO: 'RECOGIDO',
  };

  async setOrderStatus(riderId: string, id: string, status: 'ASIGNADO' | 'RECOGIDO' | 'EN_CAMINO' | 'ENTREGADO') {
    const order = await prisma.storeOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Pedido');
    if (order.riderId !== riderId) throw new AuthorizationError('Este pedido no te pertenece.');

    const current = order.deliveryStatus ?? '';
    const isForward = DeliveryService.FORWARD[current] === status;
    const isUndo = DeliveryService.BACKWARD[current] === status;
    if (!isForward && !isUndo) {
      throw new BusinessError('No se puede saltar directamente a ese estado.');
    }

    const now = new Date();
    const data: Record<string, unknown> = { deliveryStatus: status };
    if (isForward && status === 'RECOGIDO') data.pickedUpAt = now;
    if (isForward && status === 'ENTREGADO') { data.deliveredAt = now; data.status = 'DELIVERED'; }
    if (isUndo && current === 'RECOGIDO') data.pickedUpAt = null;

    const updated = await prisma.storeOrder.update({ where: { id }, data, include: orderWithItems });
    await prisma.deliveryEvent.create({ data: { orderId: id, riderId, type: isUndo ? `UNDO_${current}` : status } });

    emitEvent(`store:order-updated:${updated.orderNumber}`, {
      status: updated.status, paymentStatus: updated.paymentStatus, deliveryStatus: updated.deliveryStatus,
    });

    return toDeliveryOrderJSON(updated);
  }

  /* ── Ubicación en vivo ────────────────────────────────────────────────── */

  async updateLocation(riderId: string, lat: number, lng: number) {
    await prisma.rider.update({
      where: { id: riderId },
      data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
    });
    emitEvent('delivery:rider-location', { riderId, lat, lng });
  }

  /* ── Perfil y estado ──────────────────────────────────────────────────── */

  async getProfile(riderId: string) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundError('Repartidor');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [entregasHoyOrders, entregasSemana] = await Promise.all([
      prisma.storeOrder.findMany({
        where: { riderId, deliveryStatus: 'ENTREGADO', deliveredAt: { gte: startOfToday } },
        select: { latitude: true, longitude: true, claimedAt: true, deliveredAt: true },
      }),
      prisma.storeOrder.count({
        where: { riderId, deliveryStatus: 'ENTREGADO', deliveredAt: { gte: startOfWeek } },
      }),
    ]);

    const kmHoy = entregasHoyOrders.reduce((sum, o) => {
      if (o.latitude == null || o.longitude == null) return sum;
      return sum + haversineKm(STORE_ORIGIN, { lat: o.latitude, lng: o.longitude });
    }, 0);
    const duraciones = entregasHoyOrders
      .filter((o) => o.claimedAt && o.deliveredAt)
      .map((o) => (o.deliveredAt!.getTime() - o.claimedAt!.getTime()) / 60000);
    const tiempoPromedioMin = duraciones.length > 0
      ? Math.round(duraciones.reduce((s, d) => s + d, 0) / duraciones.length)
      : 0;

    return {
      nombre: rider.nombre,
      iniciales: rider.nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
      afiliadoDesde: rider.createdAt.getFullYear(),
      calificacion: rider.calificacion ?? null,
      entregasHoy: entregasHoyOrders.length,
      kmHoy: Math.round(kmHoy * 10) / 10,
      tiempoPromedioMin,
      entregasSemana,
      moto: {
        modelo: rider.motoModelo ?? '',
        placa: rider.motoPlaca ?? '',
        soatVigenteHasta: rider.motoSoatHasta ? rider.motoSoatHasta.toISOString().slice(0, 10) : '',
        rendimientoKmPorGalon: rider.motoRendimientoKmGalon ?? 0,
        kmTotal: rider.motoKmTotal ?? 0,
        kmUltimoMantenimiento: rider.motoKmUltimoMantenimiento ?? 0,
        intervaloMantenimientoKm: rider.motoIntervaloMantenimientoKm ?? 0,
      },
      zonas: rider.zonas,
      zonasActivas: rider.zonasActivas,
      enServicio: rider.enServicio,
    };
  }

  async updateEstado(riderId: string, data: { enServicio?: boolean; zonasActivas?: string[] }) {
    const rider = await prisma.rider.update({ where: { id: riderId }, data });
    return { enServicio: rider.enServicio, zonasActivas: rider.zonasActivas };
  }

  /* ── Billetera ────────────────────────────────────────────────────────── */

  async getWalletResumen(riderId: string) {
    const pedidosPendientes = await prisma.storeOrder.findMany({
      where: { riderId, deliveryStatus: 'ENTREGADO', liquidacionId: null },
      include: orderWithItems,
      orderBy: { deliveredAt: 'desc' },
    });
    const pendiente = pedidosPendientes.reduce((s, o) => s + Number(o.tarifaReparto ?? 0), 0);
    return { pendiente, pedidosPendientes: pedidosPendientes.map(toDeliveryOrderJSON) };
  }

  async getLiquidaciones(riderId: string) {
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { riderId },
      include: { orders: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return liquidaciones.map((l) => ({
      id: l.id,
      fecha: l.createdAt.toISOString(),
      monto: Number(l.monto),
      metodo: l.metodo as 'Efectivo' | 'Yape',
      estado: l.estado as 'SOLICITADA' | 'PAGADA',
      pedidoIds: l.orders.map((o) => o.id),
    }));
  }

  async solicitarLiquidacion(riderId: string, metodo: 'Efectivo' | 'Yape') {
    const { pendiente, pedidosPendientes } = await this.getWalletResumen(riderId);
    if (pendiente <= 0) throw new BusinessError('No tienes saldo pendiente por cobrar.');

    const liquidacion = await prisma.liquidacion.create({
      data: {
        riderId,
        monto: pendiente,
        metodo,
        orders: { connect: pedidosPendientes.map((o) => ({ id: o.id })) },
      },
      include: { orders: { select: { id: true } } },
    });

    return {
      id: liquidacion.id,
      fecha: liquidacion.createdAt.toISOString(),
      monto: Number(liquidacion.monto),
      metodo: liquidacion.metodo as 'Efectivo' | 'Yape',
      estado: liquidacion.estado as 'SOLICITADA' | 'PAGADA',
      pedidoIds: liquidacion.orders.map((o) => o.id),
    };
  }

  /* ── Combustible ──────────────────────────────────────────────────────── */

  async getFuelExpenses(riderId: string) {
    const expenses = await prisma.fuelExpense.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' } });
    return expenses.map((e) => ({ id: e.id, fecha: e.createdAt.toISOString(), monto: Number(e.monto), galones: Number(e.galones) }));
  }

  async addFuelExpense(riderId: string, monto: number, galones: number) {
    const expense = await prisma.fuelExpense.create({ data: { riderId, monto, galones } });
    return { id: expense.id, fecha: expense.createdAt.toISOString(), monto: Number(expense.monto), galones: Number(expense.galones) };
  }

  /* ── Push ─────────────────────────────────────────────────────────────── */

  async subscribePush(riderId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, riderId },
      create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, riderId },
    });
  }

  async unsubscribePush(endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /* ── Admin ────────────────────────────────────────────────────────────── */

  async listRiders() {
    return prisma.rider.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createRider(data: { nombre: string; telefono: string; pin: string }) {
    const existing = await prisma.rider.findUnique({ where: { telefono: data.telefono } });
    if (existing) throw new BusinessError('Ya existe un repartidor con ese teléfono.');
    const pinHash = await bcrypt.hash(data.pin, env.BCRYPT_ROUNDS);
    return prisma.rider.create({ data: { nombre: data.nombre, telefono: data.telefono, pinHash } });
  }

  async updateRider(id: string, data: Partial<{
    nombre: string; status: string; pin: string;
    motoModelo: string; motoPlaca: string; motoSoatHasta: Date;
    motoRendimientoKmGalon: number; motoKmTotal: number;
    motoKmUltimoMantenimiento: number; motoIntervaloMantenimientoKm: number;
    calificacion: number; zonas: string[];
  }>) {
    const rider = await prisma.rider.findUnique({ where: { id } });
    if (!rider) throw new NotFoundError('Repartidor');
    const { pin, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    if (pin) updateData.pinHash = await bcrypt.hash(pin, env.BCRYPT_ROUNDS);
    return prisma.rider.update({ where: { id }, data: updateData });
  }

  async getOrderTracking(id: string) {
    const order = await prisma.storeOrder.findUnique({
      where: { id },
      include: {
        rider: true,
        deliveryEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundError('Pedido');
    return {
      order: { id: order.id, orderNumber: order.orderNumber, status: order.status, deliveryStatus: order.deliveryStatus },
      rider: order.rider ? {
        id: order.rider.id, nombre: order.rider.nombre, telefono: order.rider.telefono,
        lastLat: order.rider.lastLat, lastLng: order.rider.lastLng, lastLocationAt: order.rider.lastLocationAt,
      } : null,
      events: order.deliveryEvents.map((e) => ({ id: e.id, type: e.type, lat: e.lat, lng: e.lng, createdAt: e.createdAt.toISOString() })),
    };
  }

  async listLiquidacionesAdmin(estado?: string) {
    const liquidaciones = await prisma.liquidacion.findMany({
      where: estado ? { estado } : undefined,
      include: { rider: { select: { nombre: true, telefono: true } }, orders: { select: { id: true, orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return liquidaciones.map((l) => ({
      id: l.id, riderNombre: l.rider.nombre, riderTelefono: l.rider.telefono,
      monto: Number(l.monto), metodo: l.metodo, estado: l.estado,
      pedidos: l.orders.map((o) => o.orderNumber),
      fecha: l.createdAt.toISOString(),
    }));
  }

  async pagarLiquidacion(id: string, userId: string) {
    const liquidacion = await prisma.liquidacion.findUnique({ where: { id } });
    if (!liquidacion) throw new NotFoundError('Liquidación');
    if (liquidacion.estado === 'PAGADA') throw new BusinessError('Esta liquidación ya está pagada.');
    return prisma.liquidacion.update({
      where: { id },
      data: { estado: 'PAGADA', pagadoPorId: userId, pagadoAt: new Date() },
    });
  }

  // Se llama desde store.service.ts cuando el admin marca un pedido READY —
  // si ya tiene biker asignado, hay que avisarle que puede ir a recogerlo.
  async notifyReadyForPickup(orderId: string, riderId: string, orderNumber: string) {
    await prisma.deliveryEvent.create({ data: { orderId, riderId, type: 'READY_NOTIFIED' } });
    const subs = await prisma.pushSubscription.findMany({ where: { riderId } });
    await pushService.sendToSubscriptions(subs, {
      title: 'Pedido listo para recoger',
      body: `El pedido ${orderNumber} ya está listo — pasa a recogerlo.`,
    });
  }
}

export const deliveryService = new DeliveryService();
