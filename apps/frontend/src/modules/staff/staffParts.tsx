// Piezas compartidas de Personal: tipos, etiquetas y controles.
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Segmented as ErpSegmented } from '@/components/erp';
import { cn, formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils';

/* ─── Tipos ─────────────────────────────────────────────────────────────── */
export type EmploymentType = 'INFORMAL' | 'PLANILLA';
export type Regime = 'MICRO' | 'GENERAL';
export type Freq = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type Pension = 'NONE' | 'ONP' | 'AFP';
export type Kind = 'REGULAR' | 'GRATIFICACION' | 'CTS' | 'VACACIONES' | 'LIQUIDACION';

export interface Employee {
  id: string; firstName: string; lastName: string; docNumber: string | null; phone: string | null; position: string | null;
  startDate: string; endDate: string | null; isActive: boolean; userId: string | null;
  employmentType: EmploymentType; laborRegime: Regime | null; payFrequency: Freq; salary: number;
  pensionSystem: Pension; afpName: string | null; afpRate: number | null; familyAllowance: boolean;
  discountAbsences: boolean; discountLateness: boolean; notes: string | null;
  user: { id: string; username: string; hasSchedule: boolean } | null;
  pendingAdvances: number;
  lastPayment: { periodEnd: string; netAmount: number; paidAt: string } | null;
  nextPeriod: { from: string; to: string };
  payDue: boolean;
  belowMinimumWage: boolean;
}

export interface Preview {
  kind: Kind; periodStart: string; periodEnd: string; note: string | null;
  attendance: { scheduledDays: number; daysWorked: number; absences: number; lateMinutes: number; minutesPerDay: number } | null;
  daysScheduled: number; daysWorked: number; lateMinutes: number;
  baseAmount: number; familyAllowance: number; bonus: number; absenceDiscount: number; lateDiscount: number;
  pendingAdvances: Array<{ id: string; amount: number; givenAt: string; notes: string | null }>;
  grossAmount: number; pensionRate: number; pensionDiscount: number; netAmount: number; employerHealth: number;
}

export interface Payment {
  id: string; number: string; kind: Kind; periodStart: string; periodEnd: string;
  employmentType: EmploymentType; laborRegime: Regime | null;
  daysScheduled: number; daysWorked: string | number; lateMinutes: number;
  baseAmount: string | number; familyAllowance: string | number; bonus: string | number;
  absenceDiscount: string | number; lateDiscount: string | number; grossAmount: string | number;
  pensionSystem: Pension; pensionRate: string | number; pensionDiscount: string | number;
  advancesDeducted: string | number; otherDiscount: string | number; otherDiscountNote: string | null;
  netAmount: string | number; employerHealth: string | number; method: string; paidAt: string;
  notes: string | null; voidedAt: string | null; voidReason: string | null;
  employee: { id: string; firstName: string; lastName: string; docNumber?: string | null; phone?: string | null; position?: string | null };
}

export interface Benefits {
  applies: boolean; regime?: Regime;
  vacation?: { perYear: number; earned: number; taken: number; available: number };
  gratificacion?: { baseAmount: number; bonus: number; months: number; note: string };
  cts?: { baseAmount: number; bonus: number; months: number; note: string };
}

/* ─── Etiquetas ─────────────────────────────────────────────────────────── */
export const FREQ_LABEL: Record<Freq, string> = { WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual' };
export const FREQ_PER: Record<Freq, string> = { WEEKLY: 'por semana', BIWEEKLY: 'por quincena', MONTHLY: 'al mes' };
export const KIND_LABEL: Record<Kind, string> = {
  REGULAR: 'Sueldo', GRATIFICACION: 'Gratificación', CTS: 'CTS', VACACIONES: 'Vacaciones', LIQUIDACION: 'Liquidación',
};
export const REGIME_LABEL: Record<Regime, string> = { MICRO: 'Microempresa', GENERAL: 'Régimen general' };
export const METHODS = Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => !['CREDIT', 'DEBIT_CARD', 'CREDIT_CARD'].includes(k));
export const n = (v: string | number | null | undefined) => Number(v ?? 0);
export const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
export const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'short' });
export const periodLabel = (from: string, to: string) => (from.slice(0, 10) === to.slice(0, 10) ? dayLabel(from) : `${dayLabel(from)} al ${dayLabel(to)}`);

export function employeeTag(e: Pick<Employee, 'employmentType' | 'laborRegime'>) {
  return e.employmentType === 'INFORMAL' ? 'Sin planilla' : `Planilla · ${REGIME_LABEL[e.laborRegime ?? 'MICRO']}`;
}

/* ─── Piezas ────────────────────────────────────────────────────────────── */
export function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size={wide ? 'lg' : 'md'} title={title} description={subtitle} footer={footer}>
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  );
}

// Campo con etiqueta. Es un div (no un label) porque algunos agrupan
// varios botones, y un label los activaría al tocar el texto.
export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-table font-medium text-ink">{label}</span>
      {children}
      {hint && <div className="text-meta text-ink-muted">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return <ErpSegmented size="md" value={value} onChange={onChange} options={options} />;
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-table text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--brand))]" />
      <span>{children}</span>
    </label>
  );
}

export function Row({ label, value, strong, muted, negative }: { label: React.ReactNode; value: number; strong?: boolean; muted?: boolean; negative?: boolean }) {
  if (!strong && !value) return null;
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1 text-table', strong && 'text-section font-semibold text-ink', muted && 'text-ink-muted')}>
      <span>{label}</span>
      <span className="tabular-nums">{negative ? `− ${formatCurrency(value)}` : formatCurrency(value)}</span>
    </div>
  );
}

export function invalidate(qc: ReturnType<typeof useQueryClient>) {
  ['staff', 'staff-payments', 'staff-employee', 'expenses', 'treasury-summary', 'treasury-movements'].forEach((k) =>
    qc.invalidateQueries({ queryKey: [k] }));
}

