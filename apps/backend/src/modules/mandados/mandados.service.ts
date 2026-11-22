import { createHmac, timingSafeEqual } from 'crypto';
import type { Mandado, MandadoItem, MandadoOferta, Prisma } from '@prisma/client';
import { prisma } from '../../database/client';
import { env } from '../../config/env';
import { emitEvent } from '../../config/socket';
import { withSequence } from '../../utils/sequence';
import { AuthorizationError, BusinessError, NotFoundError } from '../../utils/errors';
import { pushService } from '../push/push.service';
import { haversineKm, MANDADO_MAX_ADELANTO, ofertaSugeridaMandado, STORE_ORIGIN } from '../delivery/economics';

// Solicitudes de compra ("mandados"). Ver el modelo Mandado en
// schema.prisma para el ciclo completo. Reglas de plata:
// - El cliente lanza una oferta por el SERVICIO (sugerida por distancia).
// - Un repartidor la acepta tal cual o contraoferta; el cliente elige.
// - Si hay que comprar, el repartidor manda los precios reales antes de
//   pagar. Si el total cabe en el tope que el cliente autorizó, sigue solo;
//   si no, el cliente aprueba. Luego foto de la boleta y a entregar.
// - Al entregar cobra: compra + servicio (contra entrega).

export const CATEGORIAS = ['COMIDA', 'MEDICAMENTOS', 'LICORES', 'ABARROTES', 'DOCUMENTOS', 'OTROS'] as const;
export type Categoria = typeof CATEGORIAS[number];

const ACTIVOS_RIDER = ['ACORDADO', 'COTIZADO', 'COMPRA_APROBADA', 'COMPRADO', 'EN_CAMINO'];
const CANCELABLES = ['ABIERTO', 'ACORDADO', 'COTIZADO', 'COMPRA_APROBADA'];
const VELOCIDAD_KMH = 22;

type MandadoFull = Mandado & {
  items: MandadoItem[];
  ofertas: (MandadoOferta & { rider: { nombre: string; calificacion: number | null; motoModelo: string | null } })[];
  rider: { id: string; nombre: string; telefono: string; calificacion: number | null; motoModelo: string | null; motoPlaca: string | null; lastLat: number | null; lastLng: number | null; lastLocationAt: Date | null } | null;
};

const include = {
  items: { orderBy: { orden: 'asc' } },
  ofertas: { orderBy: { createdAt: 'asc' }, include: { rider: { select: { nombre: true, calificacion: true, motoModelo: true } } } },
  rider: { select: { id: true, nombre: true, telefono: true, calificacion: true, motoModelo: true, motoPlaca: true, lastLat: true, lastLng: true, lastLocationAt: true } },
} satisfies Prisma.MandadoInclude;

/* ── Clave de acceso (igual que los pedidos web: HMAC, sin guardar nada) ── */
export function mandadoAccessKey(codigo: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`mandado:${codigo}`).digest('base64url').slice(0, 16);
}
function validKey(codigo: string, key: unknown): boolean {
  if (typeof key !== 'string' || key.length !== 16) return false;
  const a = Buffer.from(mandadoAccessKey(codigo));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const n = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Math.round(Number(d) * 100) / 100);
const shortName = (nombre: string) => {
  const [a, b] = nombre.trim().split(/\s+/);
  return b ? `${a} ${b[0]}.` : a;
};

function itemsTotals(items: MandadoItem[]) {
  let estimado = 0, real = 0, conEstimado = 0;
  for (const it of items) {
    const q = Number(it.cantidad);
    if (it.precioEstimado != null) { estimado += Number(it.precioEstimado) * q; conEstimado++; }
    if (it.precioReal != null && !it.noHabia) real += Number(it.precioReal) * q;
  }
  return { estimado: Math.round(estimado * 100) / 100, real: Math.round(real * 100) / 100, todosConEstimado: conEstimado === items.length };
}

function distanciaKm(m: Mandado) {
  const hasta = m.entregaLat != null && m.entregaLng != null ? { lat: m.entregaLat, lng: m.entregaLng } : null;
  const desde = m.recojoLat != null && m.recojoLng != null ? { lat: m.recojoLat, lng: m.recojoLng } : STORE_ORIGIN;
  return hasta ? Math.round(haversineKm(desde, hasta) * 1.3 * 10) / 10 : null;
}

function baseJSON(m: MandadoFull) {
  const t = itemsTotals(m.items);
  const tarifa = n(m.tarifaAcordada);
  const compra = n(m.totalCompra);
  return {
    id: m.id,
    codigo: m.codigo,
    estado: m.estado,
    categoria: m.categoria,
    conCompra: m.conCompra,
    recojo: m.recojoNombre || m.recojoDireccion || m.recojoLat != null
      ? { nombre: m.recojoNombre, direccion: m.recojoDireccion, lat: m.recojoLat, lng: m.recojoLng }
      : null,
    entrega: {
      direccion: m.entregaDireccion, referencia: m.entregaReferencia,
      lat: m.entregaLat, lng: m.entregaLng, mapsLink: m.entregaMapsLink,
    },
    programadoPara: m.programadoPara?.toISOString() ?? null,
    nota: m.nota,
    distanciaKm: distanciaKm(m),
    items: m.items.map((it) => ({
      id: it.id, descripcion: it.descripcion, cantidad: Number(it.cantidad), unidad: it.unidad,
      precioEstimado: n(it.precioEstimado), precioReal: n(it.precioReal), noHabia: it.noHabia,
    })),
    totalEstimado: t.estimado,
    totalEstimadoCompleto: t.todosConEstimado,
    totalCompra: compra,
    presupuestoMax: n(m.presupuestoMax),
    ofertaCliente: n(m.ofertaCliente)!,
    ofertaSugerida: n(m.ofertaSugerida)!,
    tarifaAcordada: tarifa,
    // Lo que se cobra al entregar: compra real (si hay) + servicio.
    totalACobrar: tarifa != null ? Math.round(((compra ?? 0) + tarifa) * 100) / 100 : null,
    boletaFoto: m.boletaFoto,
    metodoPago: m.metodoPago,
    createdAt: m.createdAt.toISOString(),
    acordadoAt: m.acordadoAt?.toISOString() ?? null,
    cotizadoAt: m.cotizadoAt?.toISOString() ?? null,
    compradoAt: m.compradoAt?.toISOString() ?? null,
    entregadoAt: m.entregadoAt?.toISOString() ?? null,
    canceladoAt: m.canceladoAt?.toISOString() ?? null,
    motivoCancelacion: m.motivoCancelacion,
  };
}

function clienteJSON(m: MandadoFull) {
  return {
    ...baseJSON(m),
    clienteNombre: m.clienteNombre,
    clienteTelefono: m.clienteTelefono,
    accessKey: mandadoAccessKey(m.codigo),
    // El cliente ve las contraofertas vigentes para elegir.
    ofertas: m.ofertas.filter((o) => o.estado === 'PENDIENTE').map((o) => ({
      id: o.id, monto: n(o.monto)!, etaMin: o.etaMin, mensaje: o.mensaje,
      rider: { nombre: shortName(o.rider.nombre), calificacion: o.rider.calificacion, moto: o.rider.motoModelo },
      createdAt: o.createdAt.toISOString(),
    })),
    rider: m.rider ? {
      nombre: shortName(m.rider.nombre), telefono: m.rider.telefono, calificacion: m.rider.calificacion,
      moto: m.rider.motoModelo, placa: m.rider.motoPlaca,
      ubicacion: m.estado === 'EN_CAMINO' && m.rider.lastLat != null && m.rider.lastLng != null && m.rider.lastLocationAt
        && Date.now() - m.rider.lastLocationAt.getTime() < 3 * 60 * 1000
        ? { lat: m.rider.lastLat, lng: m.rider.lastLng } : null,
    } : null,
  };
}

function riderJSON(m: MandadoFull, riderId: string) {
  const mio = m.riderId === riderId;
  const miOferta = m.ofertas.find((o) => o.riderId === riderId && o.estado === 'PENDIENTE');
  return {
    ...baseJSON(m),
    mio,
    // Nombre y teléfono del cliente solo cuando el servicio ya es suyo.
    clienteNombre: mio ? m.clienteNombre : m.clienteNombre.split(/\s+/)[0],
    clienteTelefono: mio ? m.clienteTelefono : null,
    miOferta: miOferta ? { id: miOferta.id, monto: n(miOferta.monto)!, etaMin: miOferta.etaMin } : null,
    otrasOfertas: m.ofertas.filter((o) => o.estado === 'PENDIENTE' && o.riderId !== riderId).length,
  };
}

async function notifyRidersEnServicio(title: string, body: string) {
  const subs = await prisma.pushSubscription.findMany({ where: { rider: { enServicio: true, status: 'ACTIVE' } } });
  if (subs.length) await pushService.sendToSubscriptions(subs, { title, body }).catch(() => {});
}
async function notifyCliente(m: Mandado, title: string, body: string) {
  if (!m.storeCustomerId) return;
  const subs = await prisma.pushSubscription.findMany({ where: { customerId: m.storeCustomerId } });
  if (subs.length) await pushService.sendToSubscriptions(subs, { title, body, url: `/mandados/${m.codigo}` }).catch(() => {});
}
async function notifyRider(riderId: string, title: string, body: string) {
  const subs = await prisma.pushSubscription.findMany({ where: { riderId } });
  if (subs.length) await pushService.sendToSubscriptions(subs, { title, body }).catch(() => {});
}

const changed = (m: { codigo: string }) => {
  emitEvent('mandados:changed', { codigo: m.codigo });
};

export interface NuevoMandado {
  clienteNombre: string;
  clienteTelefono: string;
  categoria: Categoria;
  conCompra: boolean;
  recojoNombre?: string;
  recojoDireccion?: string;
  recojoLat?: number;
  recojoLng?: number;
  entregaDireccion: string;
  entregaReferencia?: string;
  entregaLat?: number;
  entregaLng?: number;
  entregaMapsLink?: string;
  programadoPara?: Date;
  nota?: string;
  ofertaCliente: number;
  presupuestoMax?: number;
  metodoPago: 'EFECTIVO' | 'YAPE';
  items: { descripcion: string; cantidad: number; unidad?: string; precioEstimado?: number }[];
  mayorDeEdad?: boolean;
  ventaLibre?: boolean;
}

export class MandadosService {
  /* ── Cotizar: ¿hay repartidor?, ¿cuánto cuesta?, ¿en cuánto llega? ───── */
  async cotizar(input: { conCompra: boolean; recojoLat?: number; recojoLng?: number; entregaLat?: number; entregaLng?: number }) {
    const desde = input.recojoLat != null && input.recojoLng != null ? { lat: input.recojoLat, lng: input.recojoLng } : null;
    const hasta = input.entregaLat != null && input.entregaLng != null ? { lat: input.entregaLat, lng: input.entregaLng } : null;
    const { sugerida, km } = ofertaSugeridaMandado({ desde, hasta, conCompra: input.conCompra });
    const disponibles = await prisma.rider.count({ where: { enServicio: true, status: 'ACTIVE' } });
    // Llegada estimada: ir a comprar (~10 min en tienda) + el trayecto.
    const trayectoMin = Math.ceil(((km ?? 2) / VELOCIDAD_KMH) * 60);
    const etaMin = (input.conCompra ? 15 : 8) + trayectoMin;
    return {
      sugerida, km, disponibles, etaMin,
      rango: { min: Math.max(3, sugerida - 1), max: sugerida + 3 },
      maxAdelanto: MANDADO_MAX_ADELANTO,
    };
  }

  async crear(data: NuevoMandado, storeCustomerId?: string) {
    if (data.items.length === 0 && data.conCompra) throw new BusinessError('Agrega al menos un producto a tu lista.');
    if (data.categoria === 'LICORES' && !data.mayorDeEdad) throw new BusinessError('Para pedir licores tienes que ser mayor de edad.');
    if (data.categoria === 'MEDICAMENTOS' && !data.ventaLibre) {
      throw new BusinessError('Solo medicinas de venta libre (o con receta que le muestres al repartidor).');
    }
    const estimado = data.items.reduce((s, it) => s + (it.precioEstimado ?? 0) * it.cantidad, 0);
    if (estimado > MANDADO_MAX_ADELANTO) {
      throw new BusinessError(`El repartidor adelanta hasta S/ ${MANDADO_MAX_ADELANTO}. Para compras más grandes escríbenos por WhatsApp.`);
    }
    const presupuestoMax = data.presupuestoMax != null ? Math.min(data.presupuestoMax, MANDADO_MAX_ADELANTO) : null;
    const { sugerida } = ofertaSugeridaMandado({
      desde: data.recojoLat != null && data.recojoLng != null ? { lat: data.recojoLat, lng: data.recojoLng } : null,
      hasta: data.entregaLat != null && data.entregaLng != null ? { lat: data.entregaLat, lng: data.entregaLng } : null,
      conCompra: data.conCompra,
    });

    const notas = [
      data.categoria === 'LICORES' ? 'Cliente declara ser mayor de edad (verificar DNI al entregar).' : null,
      data.categoria === 'MEDICAMENTOS' ? 'Cliente declara que son de venta libre o tiene receta.' : null,
      data.nota?.trim() || null,
    ].filter(Boolean).join(' · ') || null;

    const maxInDb = async () => {
      const rows = await prisma.$queryRaw<{ max: string | null }[]>`SELECT max(codigo) AS max FROM mandados`;
      return rows[0]?.max ? parseInt(rows[0].max.slice(2), 10) || 0 : 0;
    };
    const m = await withSequence('seq:mandado', maxInDb, (seq) => prisma.mandado.create({
      data: {
        codigo: `M-${String(seq).padStart(5, '0')}`,
        storeCustomerId: storeCustomerId ?? null,
        clienteNombre: data.clienteNombre.trim(),
        clienteTelefono: data.clienteTelefono.replace(/\D/g, '').slice(-9),
        categoria: data.categoria,
        conCompra: data.conCompra,
        recojoNombre: data.recojoNombre?.trim() || null,
        recojoDireccion: data.recojoDireccion?.trim() || null,
        recojoLat: data.recojoLat ?? null,
        recojoLng: data.recojoLng ?? null,
        entregaDireccion: data.entregaDireccion.trim(),
        entregaReferencia: data.entregaReferencia?.trim() || null,
        entregaLat: data.entregaLat ?? null,
        entregaLng: data.entregaLng ?? null,
        entregaMapsLink: data.entregaMapsLink?.trim() || null,
        programadoPara: data.programadoPara ?? null,
        nota: notas,
        ofertaCliente: data.ofertaCliente,
        ofertaSugerida: sugerida,
        presupuestoMax,
        metodoPago: data.metodoPago,
        items: {
          create: data.items.map((it, i) => ({
            orden: i, descripcion: it.descripcion.trim(), cantidad: it.cantidad,
            unidad: it.unidad?.trim() || 'und', precioEstimado: it.precioEstimado ?? null,
          })),
        },
      },
      include,
    }));

    changed(m);
    void notifyRidersEnServicio(
      `Nuevo mandado · S/ ${Number(m.ofertaCliente).toFixed(2)}`,
      `${m.items.length ? `${m.items.length} ${m.items.length === 1 ? 'cosa' : 'cosas'} · ` : ''}${m.entregaDireccion}`,
    );
    return clienteJSON(m);
  }

  /* ── Lado cliente ───────────────────────────────────────────────────── */
  private async getForCliente(codigo: string, key: unknown, storeCustomerId?: string) {
    const m = await prisma.mandado.findUnique({ where: { codigo }, include });
    if (!m) throw new NotFoundError('Solicitud');
    const owner = !!storeCustomerId && m.storeCustomerId === storeCustomerId;
    if (!owner && !validKey(codigo, key)) throw new AuthorizationError('No tienes acceso a esta solicitud.');
    return m;
  }

  async verCliente(codigo: string, key: unknown, storeCustomerId?: string) {
    return clienteJSON(await this.getForCliente(codigo, key, storeCustomerId));
  }

  async misMandados(storeCustomerId: string) {
    const list = await prisma.mandado.findMany({ where: { storeCustomerId }, include, orderBy: { createdAt: 'desc' }, take: 30 });
    return list.map(clienteJSON);
  }

  // El cliente sube (o baja) su oferta mientras nadie la tomó: es la "puja".
  async cambiarOferta(codigo: string, key: unknown, monto: number, storeCustomerId?: string) {
    const m = await this.getForCliente(codigo, key, storeCustomerId);
    if (m.estado !== 'ABIERTO') throw new BusinessError('Esta solicitud ya tiene repartidor.');
    const up = await prisma.mandado.update({ where: { id: m.id }, data: { ofertaCliente: monto }, include });
    changed(up);
    void notifyRidersEnServicio(`Mandado ${up.codigo}: ahora S/ ${monto.toFixed(2)}`, up.entregaDireccion);
    return clienteJSON(up);
  }

  async aceptarContraoferta(codigo: string, key: unknown, ofertaId: string, storeCustomerId?: string) {
    const m = await this.getForCliente(codigo, key, storeCustomerId);
    const oferta = m.ofertas.find((o) => o.id === ofertaId && o.estado === 'PENDIENTE');
    if (!oferta) throw new BusinessError('Esa oferta ya no está vigente.');
    const up = await prisma.$transaction(async (tx) => {
      const r = await tx.mandado.updateMany({
        where: { id: m.id, estado: 'ABIERTO', riderId: null },
        data: { estado: 'ACORDADO', riderId: oferta.riderId, tarifaAcordada: oferta.monto, acordadoAt: new Date() },
      });
      if (r.count === 0) throw new BusinessError('Esta solicitud ya tiene repartidor.');
      await tx.mandadoOferta.update({ where: { id: oferta.id }, data: { estado: 'ACEPTADA' } });
      await tx.mandadoOferta.updateMany({ where: { mandadoId: m.id, id: { not: oferta.id }, estado: 'PENDIENTE' }, data: { estado: 'RECHAZADA' } });
      return tx.mandado.findUniqueOrThrow({ where: { id: m.id }, include });
    });
    changed(up);
    void notifyRider(oferta.riderId, `¡${up.codigo} es tuyo!`, `El cliente aceptó tu oferta de S/ ${Number(oferta.monto).toFixed(2)}.`);
    return clienteJSON(up);
  }

  async aprobarCompra(codigo: string, key: unknown, storeCustomerId?: string) {
    const m = await this.getForCliente(codigo, key, storeCustomerId);
    if (m.estado !== 'COTIZADO') throw new BusinessError('No hay precios esperando tu aprobación.');
    const up = await prisma.mandado.update({ where: { id: m.id }, data: { estado: 'COMPRA_APROBADA' }, include });
    changed(up);
    if (up.riderId) void notifyRider(up.riderId, `${up.codigo}: compra aprobada`, `Ya puedes comprar · S/ ${Number(up.totalCompra).toFixed(2)}`);
    return clienteJSON(up);
  }

  async cancelarCliente(codigo: string, key: unknown, motivo: string | undefined, storeCustomerId?: string) {
    const m = await this.getForCliente(codigo, key, storeCustomerId);
    if (!CANCELABLES.includes(m.estado)) throw new BusinessError('El repartidor ya compró o está en camino; llámalo para coordinar.');
    const up = await prisma.mandado.update({
      where: { id: m.id },
      data: { estado: 'CANCELADO', canceladoAt: new Date(), motivoCancelacion: motivo?.trim() || 'Cancelado por el cliente' },
      include,
    });
    await prisma.mandadoOferta.updateMany({ where: { mandadoId: m.id, estado: 'PENDIENTE' }, data: { estado: 'RECHAZADA' } });
    changed(up);
    if (m.riderId) void notifyRider(m.riderId, `${m.codigo} cancelado`, 'El cliente canceló la solicitud.');
    return clienteJSON(up);
  }

  /* ── Lado repartidor ────────────────────────────────────────────────── */
  async disponibles(riderId: string) {
    const list = await prisma.mandado.findMany({ where: { estado: 'ABIERTO' }, include, orderBy: { createdAt: 'asc' } });
    return list.map((m) => riderJSON(m, riderId));
  }

  async misActivos(riderId: string) {
    const list = await prisma.mandado.findMany({ where: { riderId, estado: { in: ACTIVOS_RIDER } }, include, orderBy: { acordadoAt: 'asc' } });
    return list.map((m) => riderJSON(m, riderId));
  }

  async historial(riderId: string) {
    const list = await prisma.mandado.findMany({ where: { riderId, estado: 'ENTREGADO' }, include, orderBy: { entregadoAt: 'desc' }, take: 50 });
    return list.map((m) => riderJSON(m, riderId));
  }

  private async getForRider(riderId: string, id: string) {
    const m = await prisma.mandado.findUnique({ where: { id }, include });
    if (!m) throw new NotFoundError('Mandado');
    if (m.estado !== 'ABIERTO' && m.riderId !== riderId) throw new AuthorizationError('Este mandado ya lo tomó otro repartidor.');
    return m;
  }

  async verRider(riderId: string, id: string) {
    return riderJSON(await this.getForRider(riderId, id), riderId);
  }

  // Aceptar la oferta del cliente tal cual: el primero que la toma se la lleva.
  async aceptar(riderId: string, id: string) {
    const m = await this.getForRider(riderId, id);
    const up = await prisma.$transaction(async (tx) => {
      const r = await tx.mandado.updateMany({
        where: { id, estado: 'ABIERTO', riderId: null },
        data: { estado: 'ACORDADO', riderId, tarifaAcordada: m.ofertaCliente, acordadoAt: new Date() },
      });
      if (r.count === 0) throw new BusinessError('Ya lo tomó otro repartidor.');
      await tx.mandadoOferta.updateMany({ where: { mandadoId: id, estado: 'PENDIENTE' }, data: { estado: 'RECHAZADA' } });
      return tx.mandado.findUniqueOrThrow({ where: { id }, include });
    });
    changed(up);
    void notifyCliente(up, 'Tu mandado tiene repartidor', `${shortName(up.rider!.nombre)} aceptó por S/ ${Number(up.tarifaAcordada).toFixed(2)}.`);
    return riderJSON(up, riderId);
  }

  async contraofertar(riderId: string, id: string, monto: number, etaMin: number, mensaje?: string) {
    const m = await this.getForRider(riderId, id);
    if (m.estado !== 'ABIERTO') throw new BusinessError('Este mandado ya no recibe ofertas.');
    await prisma.mandadoOferta.upsert({
      where: { mandadoId_riderId: { mandadoId: id, riderId } },
      update: { monto, etaMin, mensaje: mensaje?.trim() || null, estado: 'PENDIENTE', createdAt: new Date() },
      create: { mandadoId: id, riderId, monto, etaMin, mensaje: mensaje?.trim() || null },
    });
    const up = await prisma.mandado.findUniqueOrThrow({ where: { id }, include });
    changed(up);
    void notifyCliente(up, 'Nueva oferta por tu mandado', `S/ ${monto.toFixed(2)} · llega en ~${etaMin} min. Ábrelo para elegir.`);
    return riderJSON(up, riderId);
  }

  async retirarOferta(riderId: string, id: string) {
    await prisma.mandadoOferta.updateMany({ where: { mandadoId: id, riderId, estado: 'PENDIENTE' }, data: { estado: 'RETIRADA' } });
    const up = await prisma.mandado.findUniqueOrThrow({ where: { id }, include });
    changed(up);
    return riderJSON(up, riderId);
  }

  async liberar(riderId: string, id: string) {
    const m = await this.getForRider(riderId, id);
    if (m.riderId !== riderId || m.estado !== 'ACORDADO') throw new BusinessError('Solo puedes soltarlo antes de cotizar o comprar.');
    const up = await prisma.mandado.update({
      where: { id },
      data: { estado: 'ABIERTO', riderId: null, tarifaAcordada: null, acordadoAt: null },
      include,
    });
    changed(up);
    void notifyCliente(up, 'Buscando otro repartidor', `El repartidor no pudo tomar ${up.codigo}; tu solicitud sigue abierta.`);
    return riderJSON(up, riderId);
  }

  // Precios reales en el punto de compra, ANTES de pagar. Si el total cabe
  // en el tope que puso el cliente, sigue solo; si no, el cliente aprueba.
  async cotizarPrecios(riderId: string, id: string, items: { id: string; precioReal?: number; noHabia?: boolean }[]) {
    const m = await this.getForRider(riderId, id);
    if (m.riderId !== riderId) throw new AuthorizationError('Este mandado no es tuyo.');
    if (!m.conCompra) throw new BusinessError('Este mandado no lleva compra.');
    if (!['ACORDADO', 'COTIZADO'].includes(m.estado)) throw new BusinessError('Ya no se pueden cambiar los precios.');
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const it of m.items) {
      const x = byId.get(it.id);
      if (!x || (!x.noHabia && (x.precioReal == null || x.precioReal < 0))) throw new BusinessError(`Falta el precio de "${it.descripcion}".`);
    }
    const total = m.items.reduce((s, it) => {
      const x = byId.get(it.id)!;
      return s + (x.noHabia ? 0 : x.precioReal! * Number(it.cantidad));
    }, 0);
    const totalCompra = Math.round(total * 100) / 100;
    if (totalCompra > MANDADO_MAX_ADELANTO) throw new BusinessError(`El total pasa el máximo de S/ ${MANDADO_MAX_ADELANTO}. Llama al cliente para coordinar.`);
    const auto = m.presupuestoMax != null && totalCompra <= Number(m.presupuestoMax);

    const up = await prisma.$transaction(async (tx) => {
      for (const it of m.items) {
        const x = byId.get(it.id)!;
        await tx.mandadoItem.update({ where: { id: it.id }, data: { precioReal: x.noHabia ? null : x.precioReal, noHabia: !!x.noHabia } });
      }
      return tx.mandado.update({
        where: { id },
        data: { totalCompra, cotizadoAt: new Date(), estado: auto ? 'COMPRA_APROBADA' : 'COTIZADO' },
        include,
      });
    });
    changed(up);
    void notifyCliente(up, auto ? `Comprando tu pedido · S/ ${totalCompra.toFixed(2)}` : 'Revisa los precios de tu compra',
      auto ? 'Cabe en tu presupuesto: el repartidor ya está comprando.' : `Total S/ ${totalCompra.toFixed(2)}. Apruébalo para que el repartidor compre.`);
    return riderJSON(up, riderId);
  }

  async marcarComprado(riderId: string, id: string, boletaFoto: string | null) {
    const m = await this.getForRider(riderId, id);
    if (m.riderId !== riderId) throw new AuthorizationError('Este mandado no es tuyo.');
    const esperado = m.conCompra ? 'COMPRA_APROBADA' : 'ACORDADO';
    if (m.estado !== esperado) {
      throw new BusinessError(m.conCompra ? 'Primero el cliente tiene que aprobar los precios.' : 'Este mandado no está para recoger.');
    }
    if (m.conCompra && !boletaFoto) throw new BusinessError('Toma una foto de la boleta o ticket de compra.');
    const up = await prisma.mandado.update({
      where: { id }, data: { estado: 'COMPRADO', compradoAt: new Date(), boletaFoto: boletaFoto ?? m.boletaFoto }, include,
    });
    changed(up);
    return riderJSON(up, riderId);
  }

  async enCamino(riderId: string, id: string) {
    const m = await this.getForRider(riderId, id);
    if (m.riderId !== riderId || m.estado !== 'COMPRADO') throw new BusinessError('Primero marca la compra o el recojo.');
    const up = await prisma.mandado.update({ where: { id }, data: { estado: 'EN_CAMINO' }, include });
    changed(up);
    void notifyCliente(up, 'Tu mandado va en camino', `Ten listo S/ ${(Number(up.totalCompra ?? 0) + Number(up.tarifaAcordada ?? 0)).toFixed(2)} (${up.metodoPago === 'YAPE' ? 'Yape' : 'efectivo'}).`);
    return riderJSON(up, riderId);
  }

  async entregado(riderId: string, id: string) {
    const m = await this.getForRider(riderId, id);
    if (m.riderId !== riderId || m.estado !== 'EN_CAMINO') throw new BusinessError('Este mandado no está en camino.');
    const up = await prisma.mandado.update({ where: { id }, data: { estado: 'ENTREGADO', entregadoAt: new Date() }, include });
    changed(up);
    return riderJSON(up, riderId);
  }

  /* ── ERP ────────────────────────────────────────────────────────────── */
  async listAdmin(estado?: string) {
    const list = await prisma.mandado.findMany({
      where: estado ? { estado } : undefined, include, orderBy: { createdAt: 'desc' }, take: 100,
    });
    return list.map((m) => ({ ...clienteJSON(m), riderNombre: m.rider?.nombre ?? null }));
  }

  async cancelarAdmin(id: string, motivo: string) {
    const m = await prisma.mandado.findUnique({ where: { id } });
    if (!m) throw new NotFoundError('Mandado');
    if (m.estado === 'ENTREGADO' || m.estado === 'CANCELADO') throw new BusinessError('Este mandado ya está cerrado.');
    const up = await prisma.mandado.update({
      where: { id }, data: { estado: 'CANCELADO', canceladoAt: new Date(), motivoCancelacion: motivo }, include,
    });
    changed(up);
    void notifyCliente(up, `${up.codigo} cancelado`, motivo);
    if (m.riderId) void notifyRider(m.riderId, `${up.codigo} cancelado`, motivo);
    return clienteJSON(up);
  }
}

export const mandadosService = new MandadosService();
