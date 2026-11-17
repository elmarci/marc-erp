// Plantilla de formulario: secciones con título corto, 2 columnas en PC y
// barra de acciones fija abajo. Más el diálogo de confirmación.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Btn, Field, fieldCls } from './ui';
import { PageHeader } from './ListView';
import { proveedores, type CompraDemo } from './data';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-line py-6 first:border-t-0 first:pt-0 lg:grid-cols-[200px_minmax(0,1fr)]">
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const lineas = [
  { producto: 'Yogurt Gloria fresa 1 L', cant: 24, costo: 5.9 },
  { producto: 'Leche Gloria azul 400 g', cant: 48, costo: 3.65 },
  { producto: 'Mantequilla Laive 200 g', cant: 12, costo: 7.8 },
];

export function FormView({ onCancel }: { onCancel: () => void }) {
  const [pago, setPago] = useState<'pagada' | 'por_pagar'>('por_pagar');
  const total = lineas.reduce((n, l) => n + l.cant * l.costo, 0);
  return (
    <div className="flex flex-col gap-5 pb-20">
      <PageHeader title="Registrar compra" />
      <div className="rounded-srf bg-surface px-5 py-6 shadow-[0_0_0_1px_hsl(var(--line))] lg:px-8">
        <Section title="Proveedor">
          <Field label="Proveedor" className="sm:col-span-2">
            <select className={fieldCls} defaultValue={proveedores[5]}>{proveedores.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="RUC" error="Ese RUC no pasa la verificación. Revisa los dígitos.">
            <input className={cn(fieldCls, 'tabular-nums shadow-[inset_0_0_0_1px_hsl(var(--bad))]')} defaultValue="20601234561" />
          </Field>
          <Field label="Comprobante">
            <div className="flex gap-2">
              <select className={cn(fieldCls, 'w-[120px]')}><option>Factura</option><option>Boleta</option><option>Sin comprobante</option></select>
              <input className={cn(fieldCls, 'tabular-nums')} defaultValue="E001-889" />
            </div>
          </Field>
          <Field label="Fecha de emisión"><input className={cn(fieldCls, 'tabular-nums')} defaultValue="15/11/2026" /></Field>
        </Section>

        <Section title="Pago">
          <Field label="Forma de pago">
            <div className="grid h-9 grid-cols-2 gap-0.5 rounded-ctl bg-ink/[0.04] p-0.5">
              {(['pagada', 'por_pagar'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setPago(k)}
                  className={cn('rounded-[5px] text-table', pago === k ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted')}>
                  {k === 'pagada' ? 'Ya la pagué' : 'Por pagar'}
                </button>
              ))}
            </div>
          </Field>
          {pago === 'por_pagar' ? (
            <Field label="Vence el"><input className={cn(fieldCls, 'tabular-nums')} defaultValue="30/11/2026" /></Field>
          ) : (
            <Field label="Pagada desde"><select className={fieldCls}><option>Caja 1</option><option>Caja General</option></select></Field>
          )}
        </Section>

        <Section title="Productos">
          <div className="sm:col-span-2">
            <table className="w-full border-separate border-spacing-0 text-table">
              <thead>
                <tr className="text-meta text-ink-muted">
                  <th className="border-b border-line pb-2 text-left font-medium">Producto</th>
                  <th className="w-24 border-b border-line pb-2 text-right font-medium">Cantidad</th>
                  <th className="w-28 border-b border-line pb-2 text-right font-medium">Costo</th>
                  <th className="hidden w-28 border-b border-line pb-2 text-right font-medium sm:table-cell">Subtotal</th>
                  <th className="w-8 border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.producto}>
                    <td className="h-11 border-b border-line pr-3 text-ink">{l.producto}</td>
                    <td className="border-b border-line pl-2"><input className={cn(fieldCls, 'h-8 text-right tabular-nums')} defaultValue={l.cant} /></td>
                    <td className="border-b border-line pl-2"><input className={cn(fieldCls, 'h-8 text-right tabular-nums')} defaultValue={l.costo.toFixed(2)} /></td>
                    <td className="hidden border-b border-line text-right tabular-nums text-ink sm:table-cell">{formatCurrency(l.cant * l.costo)}</td>
                    <td className="border-b border-line text-right">
                      <button className="grid size-7 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-bad-ink" aria-label={`Quitar ${l.producto}`}><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Btn size="sm" variant="ghost" className="mt-2 -ml-2"><Plus />Agregar producto</Btn>
          </div>
        </Section>
      </div>

      {/* Barra de acciones fija */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm lg:left-[var(--dp-sidebar)]">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 lg:px-8">
          <div className="text-table text-ink-muted">Total <span className="ml-1 text-section font-semibold tabular-nums text-ink">{formatCurrency(total)}</span></div>
          <div className="ml-auto flex gap-2">
            <Btn onClick={onCancel}>Cancelar</Btn>
            <Btn variant="primary">Guardar compra</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ compra, onOpenChange }: { compra: CompraDemo | null; onOpenChange: (open: boolean) => void }) {
  const [motivo, setMotivo] = useState('Me equivoqué de proveedor');
  return (
    <Dialog.Root open={!!compra} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="dp fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-srf bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--line))]">
          {compra && (
            <>
              <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
                <Dialog.Title className="text-section font-semibold text-ink">Anular compra {compra.numero}</Dialog.Title>
                <Dialog.Description className="text-body text-ink-muted">
                  Se retiran del stock los {compra.items} productos y se borra la deuda de{' '}
                  <span className="font-medium tabular-nums text-ink">{formatCurrency(compra.saldo || compra.total)}</span> con {compra.proveedor}.
                </Dialog.Description>
                <Field label="Motivo" className="mt-2">
                  <input className={fieldCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </Field>
              </div>
              <div className="flex justify-end gap-2 rounded-b-srf bg-surface-2 px-5 py-3">
                <Dialog.Close asChild><Btn>Volver</Btn></Dialog.Close>
                <Btn variant="danger" disabled={!motivo.trim()}>Anular compra</Btn>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
