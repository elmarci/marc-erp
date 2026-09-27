import type { DeliveryOrder, FuelExpense, OrderStatus, RiderProfile } from './types'
import { calcularTarifa } from './lib/economics'

// Capa de datos temporal mientras no existe el backend de reparto (loans/
// treasury/productos ya viven en apps/backend, pero repartidores/pedidos
// asignados todavía no). Toda la app consume esta capa a través de las
// funciones de abajo — el día que exista la API real, solo estas funciones
// cambian de un array en memoria a `fetch`/React Query contra el backend;
// nada en las páginas debería tener que cambiar.

const MOCK_PHONE = '987654321'
const MOCK_PIN = '1234'
const MOCK_NAME = 'Luis Ramírez'
const MOCK_INITIALS = 'LR'

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))

// Posición base de la tienda/zona (Manchay) — punto de partida del mapa
// cuando el navegador todavía no dio el GPS real del repartidor.
export const RIDER_BASE = { lat: -12.038, lng: -76.845 }

let orders: DeliveryOrder[] = [
  {
    id: '1842',
    numero: '#1842',
    status: 'DISPONIBLE',
    direccion: 'Jr. Las Begonias 245, Manchay',
    referencia: 'Frente a la posta de salud, casa celeste con reja negra',
    distanciaKm: 1.0,
    lat: -12.030,
    lng: -76.840,
    esperaMin: 3,
    clienteNombre: 'Rosa Injante',
    clienteTelefono: '987654321',
    items: [
      { nombre: 'Arroz Costeño 5kg', cantidad: 1 },
      { nombre: 'Leche Gloria x6', cantidad: 2 },
      { nombre: 'Detergente Bolívar 900g', cantidad: 1 },
      { nombre: 'Coca-Cola 3L', cantidad: 1 },
    ],
    contraEntrega: true,
    monto: 45.9,
    metodoPago: 'Efectivo',
    tarifaReparto: calcularTarifa(1.2),
    isNew: true,
    asignadoAt: new Date().toISOString(),
  },
  {
    id: '1839',
    numero: '#1839',
    status: 'DISPONIBLE',
    direccion: 'Av. Mariscal Castilla 890, Manchay',
    referencia: 'Edificio azul, tercer piso',
    distanciaKm: 1.8,
    lat: -12.035,
    lng: -76.841,
    esperaMin: 14,
    clienteNombre: 'Manuel Torres',
    clienteTelefono: '955112233',
    items: [{ nombre: 'Pan bolsa x12', cantidad: 1 }, { nombre: 'Mantequilla Laive', cantidad: 1 }],
    contraEntrega: true,
    monto: 12.5,
    metodoPago: 'Efectivo',
    tarifaReparto: calcularTarifa(2.8),
    isNew: false,
    asignadoAt: new Date().toISOString(),
  },
  {
    id: '1835',
    numero: '#1835',
    status: 'DISPONIBLE',
    direccion: 'Ca. Los Gladiolos 118, Manchay',
    referencia: 'Portón verde, tocar timbre',
    distanciaKm: 2.3,
    lat: -12.034,
    lng: -76.848,
    esperaMin: 21,
    clienteNombre: 'Jorge Salas',
    clienteTelefono: '944556677',
    items: [{ nombre: 'Cerveza Pilsen pack x6', cantidad: 1 }],
    contraEntrega: false,
    monto: 24.0,
    metodoPago: 'Pagado online',
    tarifaReparto: calcularTarifa(3.5),
    isNew: false,
    asignadoAt: new Date().toISOString(),
  },
]

const now = Date.now()
const history: DeliveryOrder[] = [
  {
    id: 'h1', numero: '#1801', status: 'ENTREGADO',
    direccion: 'Jr. Amazonas 402, Manchay', referencia: 'Casa blanca, segundo piso',
    distanciaKm: 1.8, lat: -12.034, lng: -76.842, esperaMin: 0,
    clienteNombre: 'Elena Vargas', clienteTelefono: '966223344',
    items: [{ nombre: 'Yogurt Gloria 1L', cantidad: 2 }, { nombre: 'Cereal Angel', cantidad: 1 }],
    contraEntrega: true, monto: 28.4, metodoPago: 'Efectivo',
    tarifaReparto: calcularTarifa(1.8), isNew: false,
    asignadoAt: new Date(now - 30 * 3600000).toISOString(),
    entregadoAt: new Date(now - 30 * 3600000 + 15 * 60000).toISOString(), duracionMin: 15,
  },
  {
    id: 'h2', numero: '#1798', status: 'ENTREGADO',
    direccion: 'Ca. San Martín 77, Manchay', referencia: 'Tienda de la esquina, preguntar por Doña Rosa',
    distanciaKm: 0.9, lat: -12.036, lng: -76.847, esperaMin: 0,
    clienteNombre: 'Rosa Chumpitaz', clienteTelefono: '977889900',
    items: [{ nombre: 'Gaseosa Inca Kola 1.5L', cantidad: 3 }],
    contraEntrega: false, monto: 21.0, metodoPago: 'Pagado online',
    tarifaReparto: calcularTarifa(0.9), isNew: false,
    asignadoAt: new Date(now - 31 * 3600000).toISOString(),
    entregadoAt: new Date(now - 31 * 3600000 + 9 * 60000).toISOString(), duracionMin: 9,
  },
  {
    id: 'h3', numero: '#1795', status: 'ENTREGADO',
    direccion: 'Av. Víctor Malásquez 560, Manchay', referencia: 'Frente al grifo',
    distanciaKm: 4.1, lat: -12.055, lng: -76.855, esperaMin: 0,
    clienteNombre: 'Pedro Quispe', clienteTelefono: '988776655',
    items: [{ nombre: 'Balón de gas 10kg', cantidad: 1 }],
    contraEntrega: true, monto: 65.0, metodoPago: 'Efectivo',
    tarifaReparto: calcularTarifa(4.1), isNew: false,
    asignadoAt: new Date(now - 34 * 3600000).toISOString(),
    entregadoAt: new Date(now - 34 * 3600000 + 20 * 60000).toISOString(), duracionMin: 20,
  },
]

const profile: RiderProfile = {
  nombre: MOCK_NAME,
  iniciales: MOCK_INITIALS,
  afiliadoDesde: 2024,
  calificacion: 4.8,
  entregasHoy: 8,
  kmHoy: 64,
  tiempoPromedioMin: 16,
  entregasSemana: 47,
  moto: {
    modelo: 'Honda Wave 110',
    placa: 'ABC-123',
    soatVigenteHasta: '12 dic',
    rendimientoKmPorGalon: 45,
    kmTotal: 8720,
    kmUltimoMantenimiento: 5600,
    intervaloMantenimientoKm: 3000,
  },
  zonas: ['Manchay', 'Pachacámac', 'Cieneguilla', 'José Gálvez'],
  zonasActivas: ['Manchay', 'Pachacámac'],
  comandosVozActivos: true,
}

export async function verifyLogin(telefono: string, pin: string): Promise<{ nombre: string; iniciales: string } | null> {
  await delay(300)
  if (telefono.replace(/\s/g, '') === MOCK_PHONE && pin === MOCK_PIN) {
    return { nombre: MOCK_NAME, iniciales: MOCK_INITIALS }
  }
  return null
}

// Bolsa abierta: pedidos que TODAVÍA no tomó nadie — cualquier repartidor
// en servicio los ve y puede tomarlos.
export async function fetchAvailableOrders(): Promise<DeliveryOrder[]> {
  await delay()
  return orders.filter((o) => o.status === 'DISPONIBLE')
}

// Los que este repartidor ya tomó y sigue trabajando (no incluye entregados,
// esos viven en el historial).
export async function fetchMyOrders(): Promise<DeliveryOrder[]> {
  await delay()
  return orders.filter((o) => o.status === 'ASIGNADO' || o.status === 'RECOGIDO' || o.status === 'EN_CAMINO')
}

export async function fetchOrder(id: string): Promise<DeliveryOrder | undefined> {
  await delay(200)
  return orders.find((o) => o.id === id) ?? history.find((o) => o.id === id)
}

// Tomar un pedido de la bolsa — falla si otro repartidor ya se lo llevó
// primero (la validación de estado real iría atómica en el backend; acá
// alcanza con revisar el estado actual antes de asignar).
export async function claimOrder(id: string): Promise<DeliveryOrder> {
  await delay(300)
  const current = orders.find((o) => o.id === id)
  if (!current) throw new Error('Pedido no encontrado')
  if (current.status !== 'DISPONIBLE') throw new Error('Este pedido ya lo tomó otro repartidor')
  orders = orders.map((o) => (o.id === id ? { ...o, status: 'ASIGNADO' as const, asignadoAt: new Date().toISOString() } : o))
  return orders.find((o) => o.id === id)!
}

// Captar varios pedidos a la vez (selección múltiple en el mapa). Sigue
// intentando aunque alguno ya no esté disponible, y reporta cuáles sí y
// cuáles no se pudieron tomar en vez de fallar todo o nada.
export async function claimOrders(ids: string[]): Promise<{ tomados: DeliveryOrder[]; fallidos: string[] }> {
  const tomados: DeliveryOrder[] = []
  const fallidos: string[] = []
  for (const id of ids) {
    try {
      tomados.push(await claimOrder(id))
    } catch {
      fallidos.push(id)
    }
  }
  return { tomados, fallidos }
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<DeliveryOrder> {
  await delay(300)
  const current = orders.find((o) => o.id === id)
  if (!current) throw new Error('Pedido no encontrado')

  if (status === 'ENTREGADO') {
    // Al entregar, el pedido se muda de "en curso" a Historial — con la
    // duración real (no un número inventado) y la tarifa que ya tenía.
    const entregadoAt = new Date().toISOString()
    const duracionMin = Math.max(1, Math.round((Date.parse(entregadoAt) - Date.parse(current.asignadoAt)) / 60000))
    const entregado: DeliveryOrder = { ...current, status, entregadoAt, duracionMin }
    orders = orders.filter((o) => o.id !== id)
    history.unshift(entregado)
    return entregado
  }

  // Deshacer una entrega (el toast de "Deshacer" puede llamar con el estado
  // anterior) — si el pedido ya se movió a historial, hay que traerlo de
  // vuelta a "en curso".
  const enHistorial = history.find((o) => o.id === id)
  if (enHistorial) {
    const restaurado: DeliveryOrder = { ...enHistorial, status, entregadoAt: undefined, duracionMin: undefined }
    history.splice(history.indexOf(enHistorial), 1)
    orders.push(restaurado)
    return restaurado
  }

  orders = orders.map((o) => (o.id === id ? { ...o, status } : o))
  return orders.find((o) => o.id === id)!
}

export async function fetchHistory(): Promise<DeliveryOrder[]> {
  await delay()
  return [...history].sort((a, b) => (b.entregadoAt ?? '').localeCompare(a.entregadoAt ?? ''))
}

export async function fetchProfile(): Promise<RiderProfile> {
  await delay()
  return profile
}

let fuelExpenses: FuelExpense[] = [
  { id: 'f1', fecha: new Date(Date.now() - 86400000).toISOString(), monto: 15.0, galones: 0.9 },
  { id: 'f2', fecha: new Date(Date.now() - 3 * 86400000).toISOString(), monto: 20.0, galones: 1.2 },
]

export async function fetchFuelExpenses(): Promise<FuelExpense[]> {
  await delay(200)
  return [...fuelExpenses].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export async function addFuelExpense(monto: number, galones: number): Promise<FuelExpense> {
  await delay(300)
  const expense: FuelExpense = { id: `f${fuelExpenses.length + 1}`, fecha: new Date().toISOString(), monto, galones }
  fuelExpenses = [expense, ...fuelExpenses]
  return expense
}
