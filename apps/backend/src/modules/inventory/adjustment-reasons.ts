// Motivos de un ajuste de inventario — lista cerrada para poder medir la merma.
// "loss: true" = es pérdida real de mercadería (va al estado de resultados);
// los demás son correcciones del registro (conteo, error al ingresar).
export const ADJUSTMENT_REASONS = {
  EXPIRED: { label: 'Vencido', loss: true },
  DAMAGED: { label: 'Dañado o malogrado', loss: true },
  THEFT: { label: 'Robo o faltante', loss: true },
  INTERNAL_USE: { label: 'Consumo interno', loss: true },
  TASTING: { label: 'Degustación o regalo', loss: true },
  COUNT: { label: 'Conteo físico', loss: false },
  ENTRY_ERROR: { label: 'Error de registro', loss: false },
  OTHER: { label: 'Otro', loss: false },
} as const;

export type AdjustmentReasonCode = keyof typeof ADJUSTMENT_REASONS;
export const ADJUSTMENT_REASON_CODES = Object.keys(ADJUSTMENT_REASONS) as [AdjustmentReasonCode, ...AdjustmentReasonCode[]];
export const LOSS_REASON_CODES = ADJUSTMENT_REASON_CODES.filter((c) => ADJUSTMENT_REASONS[c].loss);

export function adjustmentReasonLabel(code: string | null | undefined): string {
  return code && code in ADJUSTMENT_REASONS ? ADJUSTMENT_REASONS[code as AdjustmentReasonCode].label : 'Sin clasificar';
}
