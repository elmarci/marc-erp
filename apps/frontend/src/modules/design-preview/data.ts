// Datos de ejemplo SOLO para la página de concepto /design-preview.
// No se conecta a la API: es una muestra visual para aprobar el rediseño.

export type Estado = 'pagada' | 'por_pagar' | 'vencida' | 'parcial' | 'anulada';

export interface CompraDemo {
  id: string;
  numero: string;
  fecha: string; // ISO
  proveedor: string;
  ruc: string;
  comprobante: string;
  items: number;
  estado: Estado;
  total: number;
  saldo: number;
}

export const compras: CompraDemo[] = [
  { id: '1', numero: 'OC-000703', fecha: '2026-11-17', proveedor: 'Distribuidora Peruana de Alimentos y Bebidas SAC', ruc: '20123456780', comprobante: 'F001-2231', items: 18, estado: 'por_pagar', total: 1284.6, saldo: 1284.6 },
  { id: '2', numero: 'OC-000702', fecha: '2026-11-16', proveedor: 'Panificadora El Trigal', ruc: '10456789012', comprobante: 'B003-0412', items: 4, estado: 'pagada', total: 186, saldo: 0 },
  { id: '3', numero: 'OC-000701', fecha: '2026-11-15', proveedor: 'Lácteos del Sur EIRL', ruc: '20601234567', comprobante: 'E001-889', items: 12, estado: 'parcial', total: 1420, saldo: 895.4 },
  { id: '4', numero: 'OC-000700', fecha: '2026-11-14', proveedor: 'Distribuidora Peruana de Alimentos y Bebidas SAC', ruc: '20123456780', comprobante: 'B002-0014', items: 3, estado: 'anulada', total: 92.3, saldo: 0 },
  { id: '5', numero: 'OC-000699', fecha: '2026-11-13', proveedor: 'Embotelladora Andina', ruc: '20100112233', comprobante: 'F004-55120', items: 9, estado: 'pagada', total: 640, saldo: 0 },
  { id: '6', numero: 'OC-000698', fecha: '2026-11-02', proveedor: 'Avícola San Fernando', ruc: '20100154308', comprobante: 'F010-7781', items: 6, estado: 'vencida', total: 2310.5, saldo: 2310.5 },
  { id: '7', numero: 'OC-000697', fecha: '2026-11-01', proveedor: 'Comercial Lurín SRL', ruc: '20555666777', comprobante: 'F002-1190', items: 22, estado: 'pagada', total: 3105.75, saldo: 0 },
  { id: '8', numero: 'OC-000696', fecha: '2026-10-30', proveedor: 'Lácteos del Sur EIRL', ruc: '20601234567', comprobante: 'E001-861', items: 10, estado: 'pagada', total: 1180, saldo: 0 },
  { id: '9', numero: 'OC-000695', fecha: '2026-10-29', proveedor: 'Golosinas Pachacámac', ruc: '10443322110', comprobante: 'B001-0098', items: 31, estado: 'por_pagar', total: 455.2, saldo: 455.2 },
  { id: '10', numero: 'OC-000694', fecha: '2026-10-28', proveedor: 'Embotelladora Andina', ruc: '20100112233', comprobante: 'F004-54987', items: 8, estado: 'pagada', total: 512, saldo: 0 },
];

export const proveedores = [
  'Avícola San Fernando',
  'Comercial Lurín SRL',
  'Distribuidora Peruana de Alimentos y Bebidas SAC',
  'Embotelladora Andina',
  'Golosinas Pachacámac',
  'Lácteos del Sur EIRL',
  'Panificadora El Trigal',
];

// Últimos 12 días de compras, para la línea chica de cada indicador.
export const serieCompras = [820, 640, 910, 300, 1200, 760, 980, 450, 1320, 690, 1080, 1284];
export const seriePorPagar = [3200, 3100, 3600, 3550, 4100, 3900, 4300, 4200, 4700, 4650, 4950, 4945];
