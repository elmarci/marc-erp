// Motivos de ajuste de inventario — misma lista que el backend
// (modules/inventory/adjustment-reasons.ts). Los marcados "loss" son merma
// real y entran al estado de resultados; los demás son correcciones.
export const ADJUSTMENT_REASONS = [
  { code: 'COUNT', label: 'Conteo físico', loss: false },
  { code: 'EXPIRED', label: 'Vencido', loss: true },
  { code: 'DAMAGED', label: 'Dañado o malogrado', loss: true },
  { code: 'THEFT', label: 'Robo o faltante', loss: true },
  { code: 'INTERNAL_USE', label: 'Consumo interno', loss: true },
  { code: 'TASTING', label: 'Degustación o regalo', loss: true },
  { code: 'ENTRY_ERROR', label: 'Error de registro', loss: false },
  { code: 'OTHER', label: 'Otro', loss: false },
] as const;

export function adjustmentReasonLabel(code: string | null | undefined): string {
  return ADJUSTMENT_REASONS.find((r) => r.code === code)?.label ?? 'Sin clasificar';
}
