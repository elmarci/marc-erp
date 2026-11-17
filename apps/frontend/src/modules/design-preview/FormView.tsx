// Plantilla de formulario: secciones con título corto, 2 columnas en PC y
// barra de acciones fija abajo. Más el diálogo de confirmación.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Btn, Field, Panel, fieldCls } from './ui';
import { ScanBarcode } from 'lucide-react';
import { PageHeader } from './ListView';
import { proveedores, type CompraDemo } from './data';

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <Panel title={title} meta={meta}>
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:px-5 lg:py-5">{children}</div>
    </Panel>
  );
}

const lineas = [
  { producto: 'Yogurt Gloria fresa 1 L', cant: 24, costo: 5.9, vence: '2026-12-10', bono: false },
  { producto: 'Leche Gloria azul 400 g', cant: 48, costo: 3.65, vence: '2027-05-02', bono: false },
  { producto: 'Mantequilla Laive 200 g', cant: 12, costo: 7.8, vence: '2027-01-20', bono: false },
  { producto: 'Yogurt Gloria fresa 1 L', cant: 2, costo: 0, vence: '2026-12-10', bono: true },
];

type Pago = 'ahora' | 'credito' | 'pagador';
const origenes = ['Efectivo · Caja del día (Caja 1, Marcial)', 'Efectivo · Caja General', 'Yape', 'Transferencia'];

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid h-9 gap-0.5 rounded-ctl bg-ink/[0.04] p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cn('truncate rounded-[5px] px-2 text-table', value === k ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-ink/20')}>
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

function Leg({ monto, origen }: { monto: number; origen: number }) {
  return (
    <div className="flex gap-2">
      <input className={cn(fieldCls, 'w-28 shrink-0 text-right tabular-nums')} defaultValue={monto.toFixed(2)} aria-label="Monto" />
      <select className={fieldCls} defaultValue={origenes[origen]} aria-label="Sale de">{origenes.map((o) => <option key={o}>{o}</option>)}</select>
    </div>
  );
}

export function FormView({ onCancel, pagoInicial = 'ahora' }: { onCancel: () => void; pagoInicial?: Pago }) {
  const [pago, setPago] = useState<Pago>(pagoInicial);
  const [igv, setIgv] = useState(true);
  const [percep, setPercep] = useState(true);
  const total = lineas.reduce((n, l) => n + (l.bono ? 0 : l.cant * l.costo), 0);
  const base = total / 1.18;
  const igvMonto = igv ? total - base : 0;
  const percepMonto = percep ? Math.round(total * 0.02 * 100) / 100 : 0;
  const aPagar = total + percepMonto;
  return (
    <div className="flex flex-col gap-5 pb-20">
      <PageHeader title="Registrar compra" />
      <div className="flex flex-col gap-4">
        <Section title="Proveedor y documento">
          <Field label="Proveedor">
            <select className={fieldCls} defaultValue={proveedores[5]}>{proveedores.map((p) => <option key={p}>{p}</option>)}</select>
          </Field>
          <Field label="RUC" hint="Viene del proveedor. Si lo corriges, se guarda en su ficha.">
            <input className={cn(fieldCls, 'tabular-nums')} defaultValue="20601234567" />
          </Field>
          <Field label="Comprobante">
            <div className="flex gap-2">
              <select className={cn(fieldCls, 'w-[120px]')}><option>Factura</option><option>Boleta</option><option>Sin comprobante</option></select>
              <input className={cn(fieldCls, 'tabular-nums')} defaultValue="E001-889" aria-label="Serie y número" />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Emisión"><input type="date" className={cn(fieldCls, 'tabular-nums')} defaultValue="2026-11-15" /></Field>
            <Field label="Recepción"><input type="date" className={cn(fieldCls, 'tabular-nums')} defaultValue="2026-11-17" /></Field>
          </div>
        </Section>

        <Section title="Productos" meta="3 productos · stock y costo se actualizan al guardar">
          <div className="sm:col-span-2">
            <div className="relative mb-3">
              <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input className={cn(fieldCls, 'pl-8')} placeholder="Buscar por nombre o escanear código de barras" />
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-table">
              <thead>
                <tr className="text-meta text-ink-muted">
                  <th className="border-b border-line pb-2 text-left font-medium">Producto</th>
                  <th className="w-24 border-b border-line pb-2 text-right font-medium">Cantidad</th>
                  <th className="w-28 border-b border-line pb-2 text-right font-medium">{igv ? 'Costo c/ IGV' : 'Costo'}</th>
                  <th className="w-36 border-b border-line pb-2 pl-2 text-left font-medium">Vence</th>
                  <th className="w-24 border-b border-line pb-2 pl-2 text-left font-medium">Lote</th>
                  <th className="hidden w-28 border-b border-line pb-2 text-right font-medium sm:table-cell">Subtotal</th>
                  <th className="w-8 border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="h-11 border-b border-line pr-3 text-ink">
                      {l.producto}
                      {l.bono && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-meta text-ink">Bonificación</span>}
                    </td>
                    <td className="border-b border-line pl-2"><input className={cn(fieldCls, 'h-8 text-right tabular-nums')} defaultValue={l.cant} /></td>
                    <td className="border-b border-line pl-2"><input className={cn(fieldCls, 'h-8 text-right tabular-nums')} defaultValue={l.costo.toFixed(2)} /></td>
                    <td className="border-b border-line pl-2"><input type="date" className={cn(fieldCls, 'h-8 tabular-nums')} defaultValue={l.vence} aria-label="Vence" /></td>
                    <td className="border-b border-line pl-2"><input className={cn(fieldCls, 'h-8')} placeholder="Opcional" aria-label="Lote" /></td>
                    <td className="hidden border-b border-line text-right tabular-nums text-ink sm:table-cell">{l.bono ? 'Gratis' : formatCurrency(l.cant * l.costo)}</td>
                    <td className="border-b border-line text-right">
                      <button className="grid size-7 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-bad-ink" aria-label={`Quitar ${l.producto}`}><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="mt-2 text-meta text-ink-muted">Cada línea puede marcarse como bonificación (costo 0) o pasar a sacos y peso para productos a granel, como hoy.</p>
          </div>
        </Section>

        <Section title="Impuestos">
          <div className="flex items-start gap-3">
            <Toggle on={igv} onChange={setIgv} label="Afecto a IGV" />
            <div className="min-w-0">
              <div className="text-table font-medium text-ink">Afecto a IGV</div>
              <div className="text-meta text-ink-muted">
                {igv ? <>Los costos ya incluyen IGV. IGV dentro: <span className="whitespace-nowrap tabular-nums text-ink">{formatCurrency(igvMonto)}</span> · base <span className="whitespace-nowrap tabular-nums">{formatCurrency(base)}</span></> : 'No suma al IGV acumulado de compras.'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Toggle on={percep} onChange={setPercep} label="Percepción" />
            <div className="min-w-0 flex-1">
              <div className="text-table font-medium text-ink">Percepción</div>
              {percep ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <input className={cn(fieldCls, 'w-28 text-right tabular-nums')} defaultValue={percepMonto.toFixed(2)} aria-label="Monto de percepción" />
                  <span className="text-meta text-ink-muted">2% sugerido, editable</span>
                </div>
              ) : <div className="text-meta text-ink-muted">El proveedor no cobró percepción.</div>}
            </div>
          </div>
        </Section>

        <Section title="Pago">
          <div className="sm:col-span-2">
            <Segmented value={pago} onChange={setPago} options={[['ahora', 'Pagado ahora'], ['credito', 'A crédito con el proveedor'], ['pagador', 'Lo financió un pagador']]} />
          </div>
          {pago === 'ahora' && (
            <Field label="Sale de" className="sm:col-span-2">
              <div className="flex flex-col gap-2">
                <Leg monto={300} origen={0} />
                <Leg monto={aPagar - 300} origen={2} />
                <Btn size="sm" variant="ghost" className="-ml-2 self-start"><Plus />Pagar con otra fuente</Btn>
              </div>
            </Field>
          )}
          {pago === 'credito' && (
            <Field label="Vence el" hint="Según el plazo del proveedor (15 días).">
              <input type="date" className={cn(fieldCls, 'tabular-nums')} defaultValue="2026-12-02" />
            </Field>
          )}
          {pago === 'pagador' && (<>
            <Field label="Pagador"><select className={fieldCls}><option>Rosa (mamá)</option><option>Jorge</option><option>Nuevo pagador…</option></select></Field>
            <Field label="Monto que puso" hint="Queda como deuda con el pagador. El resto va abajo.">
              <input className={cn(fieldCls, 'text-right tabular-nums')} defaultValue="300.00" />
            </Field>
            <Field label="El resto" className="sm:col-span-2">
              <div className="flex flex-col gap-2">
                <Leg monto={aPagar - 300} origen={1} />
                <span className="text-meta text-ink-muted">O déjalo a crédito con el proveedor.</span>
              </div>
            </Field>
          </>)}
        </Section>

        <Section title="Notas">
          <Field label="Observaciones" className="sm:col-span-2"><input className={fieldCls} placeholder="Opcional" /></Field>
        </Section>
      </div>

      {/* Barra de acciones fija */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm lg:left-[var(--dp-sidebar)]">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 lg:px-8">
          <div className="flex items-baseline gap-4 text-table text-ink-muted">
            <span className="hidden sm:inline">Mercadería <span className="tabular-nums text-ink">{formatCurrency(total)}</span></span>
            {percep && <span className="hidden sm:inline">Percepción <span className="tabular-nums text-ink">{formatCurrency(percepMonto)}</span></span>}
            <span>A pagar <span className="ml-1 text-section font-semibold tabular-nums text-ink">{formatCurrency(aPagar)}</span></span>
          </div>
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
