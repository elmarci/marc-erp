// Constancia de pago (imprimir, WhatsApp, anular) e historial del trabajador.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, HandCoins, Wallet, Pencil, History, Printer, MessageCircle, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Modal, Segmented as ErpSegmented, fieldCls, surfaceCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency, formatDate, PAYMENT_METHOD_LABELS, todayLimaDateString } from '@/lib/utils';

import {
  type Employee, type Payment, type Benefits, KIND_LABEL, n, name, periodLabel, employeeTag, Sheet, Field, invalidate,
} from './staffParts';

/* ─── Constancia / boleta ───────────────────────────────────────────────── */
function receiptLines(p: Payment) {
  const lines: Array<[string, number, boolean?]> = [
    [KIND_LABEL[p.kind], n(p.baseAmount)],
    ['Asignación familiar', n(p.familyAllowance)],
    ['Bono', n(p.bonus)],
    ['Descuento por faltas', -n(p.absenceDiscount)],
    ['Descuento por tardanzas', -n(p.lateDiscount)],
    ['Total ganado', n(p.grossAmount), true],
    [`${p.pensionSystem === 'AFP' ? 'AFP' : 'ONP'} (${n(p.pensionRate)}%)`, -n(p.pensionDiscount)],
    ['Adelantos', -n(p.advancesDeducted)],
    [p.otherDiscountNote ? `Descuento: ${p.otherDiscountNote}` : 'Otro descuento', -n(p.otherDiscount)],
  ];
  return lines.filter(([, value, always]) => always || value !== 0);
}

function printReceipt(p: Payment, business: string) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { toast.error('Permite las ventanas emergentes para imprimir.'); return; }
  const money = (x: number) => `S/ ${Math.abs(x).toFixed(2)}`;
  const rows = receiptLines(p).map(([l, x, strong]) =>
    `<tr${strong ? ' class="b"' : ''}><td>${l}</td><td class="r">${x < 0 ? '− ' : ''}${money(x)}</td></tr>`).join('');
  const title = p.employmentType === 'PLANILLA' ? 'Boleta de pago' : 'Constancia de pago';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} ${p.number}</title>
<style>body{font-family:system-ui,Arial,sans-serif;font-size:13px;padding:24px;color:#111}h1{font-size:16px;margin:0 0 2px}
p{margin:2px 0}table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:5px 0}.r{text-align:right}
.b td{font-weight:700;border-top:1px solid #ddd}.net td{font-size:16px;font-weight:800;border-top:2px solid #111;padding-top:8px}
.m{color:#666}.sig{margin-top:56px;display:flex;gap:24px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}</style>
</head><body><h1>${business}</h1><p class="m">${title} ${p.number}${p.voidedAt ? ' · ANULADO' : ''}</p>
<p style="margin-top:12px"><b>${name(p.employee)}</b>${p.employee.docNumber ? ` · DNI ${p.employee.docNumber}` : ''}</p>
${p.employee.position ? `<p class="m">${p.employee.position}</p>` : ''}
<p class="m">${p.kind === 'REGULAR' ? `Periodo: ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind]}${n(p.daysWorked) ? ` · ${n(p.daysWorked)} días` : ''}</p>
<table>${rows}<tr class="net"><td>Recibe</td><td class="r">${money(n(p.netAmount))}</td></tr></table>
<p class="m">Pagado el ${new Date(p.paidAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })} con ${PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
${n(p.employerHealth) ? `<p class="m">Aporte del empleador (${p.laborRegime === 'GENERAL' ? 'EsSalud' : 'SIS'}): ${money(n(p.employerHealth))}</p>` : ''}
<div class="sig"><div>Empleador</div><div>Trabajador</div></div>
<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

function whatsappText(p: Payment, business: string) {
  const lines = receiptLines(p).map(([l, x]) => `${l}: ${x < 0 ? '- ' : ''}S/ ${Math.abs(x).toFixed(2)}`);
  return [
    `*${business}*`, `${p.employmentType === 'PLANILLA' ? 'Boleta' : 'Constancia'} de pago ${p.number}`,
    `${name(p.employee)}`, p.kind === 'REGULAR' ? `Periodo: ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind],
    '', ...lines, `*Recibe: S/ ${n(p.netAmount).toFixed(2)}*`,
  ].join('\n');
}

export function ReceiptModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Array<{ key: string; value: string }> }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });
  const business = settings?.find((x) => x.key === 'business_name')?.value || 'Minimarket';
  const { data: p } = useQuery({
    queryKey: ['staff-payment', paymentId],
    queryFn: async () => (await api.get<{ data: Payment }>(`/staff/payments/${paymentId}`)).data.data,
  });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidMut = useMutation({
    mutationFn: () => api.post(`/staff/payments/${paymentId}/void`, { reason }),
    onSuccess: () => { invalidate(qc); qc.invalidateQueries({ queryKey: ['staff-payment', paymentId] }); toast.success('Pago anulado. Los adelantos vuelven a quedar por descontar.'); setVoiding(false); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const phone = p?.employee.phone?.replace(/\D/g, '');

  return (
    <Sheet title={p ? `${p.employmentType === 'PLANILLA' ? 'Boleta' : 'Constancia'} ${p.number}` : 'Pago'} subtitle={p ? name(p.employee) : undefined} onClose={onClose}
      footer={p && !p.voidedAt ? (voiding ? <>
        <Btn className="flex-1" onClick={() => setVoiding(false)}>Volver</Btn>
        <Btn variant="danger" className="flex-1" loading={voidMut.isPending} disabled={reason.trim().length < 3} onClick={() => voidMut.mutate()}>Anular pago</Btn>
      </> : <>
        <Btn className="flex-1" onClick={() => printReceipt(p, business)}><Printer />Imprimir</Btn>
        <Btn variant="primary" className="flex-1" onClick={() => window.open(`https://wa.me/${phone ? (phone.length === 9 ? `51${phone}` : phone) : ''}?text=${encodeURIComponent(whatsappText(p, business))}`, '_blank')}>
          <MessageCircle  />WhatsApp
        </Btn>
      </>) : undefined}>
      {!p ? <p className="py-8 text-center text-ink-muted">Cargando...</p> : (
        <div className="space-y-3">
          {p.voidedAt && <p className="rounded-ctl bg-destructive/10 p-3 text-table text-bad-ink">Anulado: {p.voidReason}</p>}
          <p className="text-table text-ink-muted">
            {p.kind === 'REGULAR' ? `Periodo ${periodLabel(p.periodStart, p.periodEnd)}` : KIND_LABEL[p.kind]}
            {n(p.daysWorked) ? ` · ${n(p.daysWorked)} días` : ''} · pagado el {formatDate(p.paidAt)} con {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
          </p>
          <div className="rounded-ctl bg-surface-2 p-4">
            {receiptLines(p).map(([l, x, strong]) => (
              <div key={l} className={cn('flex justify-between py-1 text-table', strong && 'mt-1 border-t border-line pt-2 font-semibold', x < 0 && 'text-ink-muted')}>
                <span>{l}</span><span className="tabular-nums">{x < 0 ? `− ${formatCurrency(-x)}` : formatCurrency(x)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-section font-semibold"><span>Recibe</span><span className="tabular-nums">{formatCurrency(n(p.netAmount))}</span></div>
          </div>
          {!p.voidedAt && (voiding ? (
            <Field label="¿Por qué lo anulas?" hint="El dinero vuelve a Caja General y los adelantos quedan por descontar otra vez.">
              <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          ) : (
            <button type="button" className="text-table text-ink-muted hover:text-bad-ink" onClick={() => setVoiding(true)}>Anular este pago</button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ─── Historial de un trabajador ────────────────────────────────────────── */
export function HistoryModal({ employee, onClose, onOpenPayment }: { employee: Employee; onClose: () => void; onOpenPayment: (id: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['staff-employee', employee.id],
    queryFn: async () => (await api.get<{ data: { advances: Array<{ id: string; amount: string; givenAt: string; notes: string | null; paymentId: string | null; voidedAt: string | null; method: string }>; payments: Payment[] } }>(`/staff/${employee.id}`)).data.data,
  });
  const { data: benefits } = useQuery({
    queryKey: ['staff-benefits', employee.id],
    queryFn: async () => (await api.get<{ data: Benefits }>(`/staff/${employee.id}/benefits`)).data.data,
    enabled: employee.employmentType === 'PLANILLA',
  });
  const voidAdv = useMutation({
    mutationFn: (id: string) => api.post(`/staff/advances/${id}/void`, { reason: 'Anulado desde el historial' }),
    onSuccess: () => { invalidate(qc); toast.success('Adelanto anulado. El dinero vuelve a Caja General.'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Sheet title={name(employee)} subtitle={`${employeeTag(employee)} · desde ${formatDate(employee.startDate)}`} onClose={onClose} wide>
      {benefits?.applies && benefits.vacation && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-ctl bg-surface-2 p-3">
            <p className="text-meta text-ink-muted">Vacaciones por tomar</p>
            <p className="text-kpi font-semibold tabular-nums">{benefits.vacation.available} días</p>
            <p className="text-meta text-ink-muted">{benefits.vacation.perYear} al año, {benefits.vacation.taken} tomados en el sistema</p>
          </div>
          {benefits.regime === 'GENERAL' && benefits.gratificacion && (
            <div className="rounded-ctl bg-surface-2 p-3">
              <p className="text-meta text-ink-muted">Gratificación acumulada</p>
              <p className="text-kpi font-semibold tabular-nums">{formatCurrency(benefits.gratificacion.baseAmount + benefits.gratificacion.bonus)}</p>
              <p className="text-meta text-ink-muted">{benefits.gratificacion.months} de 6 meses</p>
            </div>
          )}
          {benefits.regime === 'GENERAL' && benefits.cts && (
            <div className="rounded-ctl bg-surface-2 p-3">
              <p className="text-meta text-ink-muted">CTS acumulada</p>
              <p className="text-kpi font-semibold tabular-nums">{formatCurrency(benefits.cts.baseAmount)}</p>
              <p className="text-meta text-ink-muted">{benefits.cts.months} de 6 meses</p>
            </div>
          )}
        </div>
      )}
      <div>
        <p className="mb-2 text-table font-medium">Pagos</p>
        <div className="divide-y divide-line rounded-ctl bg-surface-2">
          {(data?.payments ?? []).length === 0 && <p className="p-4 text-table text-ink-muted">Aún no hay pagos.</p>}
          {(data?.payments ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => onOpenPayment(p.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2/50">
              <span className="min-w-0">
                <span className={cn('block text-table font-medium', p.voidedAt && 'line-through text-ink-muted')}>
                  {KIND_LABEL[p.kind]} {p.kind === 'REGULAR' ? periodLabel(p.periodStart, p.periodEnd) : ''}
                </span>
                <span className="block text-meta text-ink-muted">{p.number} · {formatDate(p.paidAt)}{p.voidedAt ? ' · anulado' : ''}</span>
              </span>
              <span className="shrink-0 text-table font-semibold tabular-nums">{formatCurrency(n(p.netAmount))}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-table font-medium">Adelantos</p>
        <div className="divide-y divide-line rounded-ctl bg-surface-2">
          {(data?.advances ?? []).length === 0 && <p className="p-4 text-table text-ink-muted">Sin adelantos.</p>}
          {(data?.advances ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className={cn('block text-table font-medium', a.voidedAt && 'line-through text-ink-muted')}>{formatCurrency(n(a.amount))}{a.notes ? ` · ${a.notes}` : ''}</span>
                <span className="block text-meta text-ink-muted">
                  {formatDate(a.givenAt)} · {a.voidedAt ? 'anulado' : a.paymentId ? 'ya descontado' : 'por descontar'}
                </span>
              </span>
              {!a.voidedAt && !a.paymentId && (
                <Btn size="sm" variant="ghost" className="text-ink-muted" loading={voidAdv.isPending && voidAdv.variables === a.id} onClick={() => voidAdv.mutate(a.id)}>Anular</Btn>
              )}
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

