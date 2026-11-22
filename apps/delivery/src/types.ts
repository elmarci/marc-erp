// DISPONIBLE = en la bolsa, cualquier repartidor en servicio puede tomarlo.
// ASIGNADO = ya lo tomó este repartidor (puede haberlo tomado junto con
// otros, ver "captar 2+ pedidos" en PedidosPage).
export type OrderStatus = 'DISPONIBLE' | 'ASIGNADO' | 'RECOGIDO' | 'EN_CAMINO' | 'ENTREGADO'

export interface DeliveryOrderItem {
  nombre: string
  cantidad: number
}

export type TamanoPaquete = 'chico' | 'mediano' | 'grande'
export type TipoEmpaque = 'bolsa' | 'caja' | 'bulto'

export interface PaqueteInfo {
  tamano: TamanoPaquete
  tipo: TipoEmpaque
  pesoKg: number
  fragil: boolean
}

export interface DeliveryOrder {
  id: string
  numero: string
  status: OrderStatus
  direccion: string
  referencia: string
  distanciaKm: number
  lat: number
  lng: number
  esperaMin: number
  clienteNombre: string
  clienteTelefono: string
  items: DeliveryOrderItem[]
  paquete: PaqueteInfo
  contraEntrega: boolean
  monto: number
  metodoPago: string
  // Lo que el repartidor GANA por hacer este viaje — distinto de `monto`,
  // que en un pedido contra-entrega es plata del cliente que solo pasa por
  // sus manos camino a la tienda. Nunca mostrar estos dos juntos como si
  // fueran lo mismo.
  tarifaReparto: number
  // Cuándo entregarlo: EXPRESS (ya), PROGRAMADO (fecha y hora) o SIN_HORA.
  entrega: { tipo: 'EXPRESS' | 'PROGRAMADO' | 'SIN_HORA'; at: string | null; turno: string | null }
  recibe: string | null
  nota: string | null
  isNew: boolean
  asignadoAt: string
  entregadoAt?: string
  duracionMin?: number
}

export interface RiderProfile {
  nombre: string
  iniciales: string
  afiliadoDesde: number
  calificacion: number
  entregasHoy: number
  kmHoy: number
  tiempoPromedioMin: number
  entregasSemana: number
  moto: {
    modelo: string
    placa: string
    soatVigenteHasta: string
    rendimientoKmPorGalon: number
    kmTotal: number
    kmUltimoMantenimiento: number
    intervaloMantenimientoKm: number
  }
  zonas: string[]
  zonasActivas: string[]
  comandosVozActivos: boolean
}

export interface FuelExpense {
  id: string
  fecha: string
  monto: number
  galones: number
}

export type MetodoLiquidacion = 'Efectivo' | 'Yape'

// El pago de la tarifa de reparto no es al toque: la tienda le debe al
// repartidor cada entrega hasta que se hace un corte (liquidación) y se le
// paga junto. Esto es ese corte — cubre uno o varios pedidos entregados.
export interface Liquidacion {
  id: string
  fecha: string
  monto: number
  metodo: MetodoLiquidacion
  pedidoIds: string[]
}

// ── Mandados (solicitudes de compra del cliente) ──────────────────────────
export type EstadoMandado = 'ABIERTO' | 'ACORDADO' | 'COTIZADO' | 'COMPRA_APROBADA' | 'COMPRADO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO'
export type CategoriaMandado = 'COMIDA' | 'MEDICAMENTOS' | 'LICORES' | 'ABARROTES' | 'DOCUMENTOS' | 'OTROS'

export interface MandadoItem {
  id: string
  descripcion: string
  cantidad: number
  unidad: string
  precioEstimado: number | null
  precioReal: number | null
  noHabia: boolean
}

export interface Mandado {
  id: string
  codigo: string
  estado: EstadoMandado
  categoria: CategoriaMandado
  conCompra: boolean
  recojo: { nombre: string | null; direccion: string | null; lat: number | null; lng: number | null } | null
  entrega: { direccion: string; referencia: string | null; lat: number | null; lng: number | null; mapsLink: string | null }
  programadoPara: string | null
  nota: string | null
  distanciaKm: number | null
  items: MandadoItem[]
  totalEstimado: number
  totalEstimadoCompleto: boolean
  totalCompra: number | null
  presupuestoMax: number | null
  ofertaCliente: number
  ofertaSugerida: number
  tarifaAcordada: number | null
  totalACobrar: number | null
  boletaFoto: string | null
  metodoPago: 'EFECTIVO' | 'YAPE'
  createdAt: string
  entregadoAt: string | null
  mio: boolean
  clienteNombre: string
  clienteTelefono: string | null
  miOferta: { id: string; monto: number; etaMin: number } | null
  otrasOfertas: number
}
