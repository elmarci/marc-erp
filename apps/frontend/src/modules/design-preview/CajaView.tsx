// Propuesta de Caja (concepto, datos de ejemplo).
// Hoy: una ficha por caja abierta con lo esperado y 3 acciones.
// Caja General: las 3 cuentas por separado, cada una con su arqueo.
// Cierre: una sola tabla Esperado / Contado / Diferencia.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Lock, Plus, Printer, Search } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Btn, Field, fieldCls } from './ui';
import { PageHeader } from './ListView';

export type CajaTab = 'hoy' | 'general' | 'cierres' | 'prestamos';

function Tabs({ value, onChange }: { value: CajaTab; onChange: (v: CajaTab) => void }) {
  const tabs: [CajaTab, string, string?][] = [['hoy', 'Hoy', '1 abierta'], ['general', 'Caja General'], ['cierres', 'Cierres y arqueos'], ['prestamos', 'Préstamos']];
  return (
    <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map(([k, l, extra]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn('-mb-px shrink-0 border-b-2 pb-2.5 text-table', value === k ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
          {l}{extra && <span className="ml-1.5 text-meta text-ink-muted">{extra}</span>}
        </button>
      ))}
    </div>
  );
}

function Money({ v, sign }: { v: number; sign?: boolean }) {
  return (
    <span className={cn('tabular-nums', sign && v < 0 && 'text-bad-ink')}>
      {sign && v > 0 ? '+' : ''}{v < 0 ? '−' : ''}{formatCurrency(Math.abs(v))}
    </span>
  );
}

const movsSesion = [
  { hora: '13:42', tipo: 'Venta', det: 'V-001284 · 6 productos', metodo: 'Efectivo', monto: 38.5 },
  { hora: '13:10', tipo: 'Salida', det: 'Pago a Panificadora El Trigal · OC-000702', metodo: 'Efectivo', monto: -186 },
  { hora: '12:55', tipo: 'Venta', det: 'V-001283 · 2 productos', metodo: 'Yape', monto: 12.8 },
  { hora: '11:30', tipo: 'Salida', det: 'A Caja General · excedente', metodo: 'Efectivo', monto: -300 },
  { hora: '10:02', tipo: 'Entrada', det: 'Sencillo desde Caja General', metodo: 'Efectivo', monto: 50 },
  { hora: '07:02', tipo: 'Apertura', det: 'Monto inicial', metodo: 'Efectivo', monto: 100 },
];

function HoyView({ onSalida, onCerrar }: { onSalida: () => void; onCerrar: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <span className="size-1.5 rounded-full bg-ok" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium text-ink">Caja 1</div>
            <div className="text-meta text-ink-muted">Marcial · abierta 7:02 a. m. · inicial S/ 100.00</div>
          </div>
          <div className="flex gap-2">
            <Btn size="sm" onClick={onSalida}><ArrowUpRight />Sacar dinero</Btn>
            <Btn size="sm"><ArrowDownLeft />Meter dinero</Btn>
            <Btn size="sm" variant="primary" onClick={onCerrar}><Lock />Cerrar caja</Btn>
          </div>
        </header>
        <div className="grid divide-line sm:grid-cols-[1.2fr_1fr_1fr] sm:divide-x">
          <div className="px-4 py-4">
            <div className="text-meta text-ink-muted">Efectivo que debe haber</div>
            <div className="text-kpi font-semibold tabular-nums text-ink">S/ 1,066.30</div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-table">
              <span className="text-ink-muted">Inicial</span><Money v={100} />
              <span className="text-ink-muted">Ventas en efectivo</span><Money v={1402.3} />
              <span className="text-ink-muted">Entradas</span><Money v={50} />
              <span className="text-ink-muted">Salidas</span><Money v={-486} sign />
            </div>
          </div>
          <div className="border-t border-line px-4 py-4 sm:border-t-0">
            <div className="text-meta text-ink-muted">Vendido hoy · 84 ventas</div>
            <div className="text-kpi font-semibold tabular-nums text-ink">S/ 2,184.60</div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-table">
              <span className="text-ink-muted">Efectivo</span><Money v={1402.3} />
              <span className="text-ink-muted">Yape</span><Money v={612.4} />
              <span className="text-ink-muted">Tarjeta</span><Money v={169.9} />
            </div>
          </div>
          <div className="border-t border-line px-4 py-4 sm:border-t-0">
            <div className="text-meta text-ink-muted">Salió de la caja</div>
            <div className="text-kpi font-semibold tabular-nums text-ink">S/ 486.00</div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-table">
              <span className="text-ink-muted">A Caja General</span><Money v={300} />
              <span className="text-ink-muted">Pagos a proveedores</span><Money v={186} />
              <span className="text-ink-muted">Gastos</span><Money v={0} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <h2 className="mr-auto px-1 text-section font-semibold text-ink">Movimientos de Caja 1</h2>
          <div className="flex gap-0.5 rounded-ctl bg-ink/[0.04] p-0.5">
            {['Todo', 'Ventas', 'Entradas y salidas'].map((t, i) => (
              <button key={t} className={cn('h-7 rounded-[5px] px-2.5 text-table', i === 0 ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted')}>{t}</button>
            ))}
          </div>
        </div>
        <table className="mt-2 w-full border-separate border-spacing-0 text-table">
          <thead>
            <tr className="text-meta text-ink-muted">
              <th className="w-16 border-b border-line px-3 py-2 text-left font-medium">Hora</th>
              <th className="border-b border-line px-3 py-2 text-left font-medium">Detalle</th>
              <th className="hidden border-b border-line px-3 py-2 text-left font-medium sm:table-cell">Medio</th>
              <th className="border-b border-line px-3 py-2 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {movsSesion.map((m) => (
              <tr key={m.hora + m.det} className="hover:bg-surface-2">
                <td className="h-10 border-b border-line px-3 tabular-nums text-ink-muted">{m.hora}</td>
                <td className="border-b border-line px-3 text-ink"><span className="mr-2 text-ink-muted">{m.tipo}</span>{m.det}</td>
                <td className="hidden border-b border-line px-3 text-ink-muted sm:table-cell">{m.metodo}</td>
                <td className="border-b border-line px-3 text-right font-medium"><Money v={m.monto} sign /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2.5 text-meta text-ink-muted">Las otras 80 ventas están en Ventas.</div>
      </section>
    </div>
  );
}

const cuentas = [
  { nombre: 'Efectivo', saldo: 3279.5, arqueo: 'Contado hace 2 días · cuadró', ok: true },
  { nombre: 'Yape', saldo: 1846.1, arqueo: 'Contado ayer · faltaron S/ 4.00', ok: false },
  { nombre: 'Plin', saldo: 120, arqueo: 'Sin arqueo este mes', ok: null },
];
const movsGeneral = [
  { fecha: '17/11 13:10', det: 'Pago a Lácteos del Sur · OC-000701', cuenta: 'Yape', monto: -524.6, saldo: 1846.1 },
  { fecha: '17/11 11:30', det: 'Desde Caja 1 · excedente', cuenta: 'Efectivo', monto: 300, saldo: 3279.5 },
  { fecha: '17/11 11:01', det: 'Gasto · Recibo de agua octubre', cuenta: 'Yape', monto: -96.4, saldo: 2370.7 },
  { fecha: '17/11 10:02', det: 'Sencillo a Caja 1', cuenta: 'Efectivo', monto: -50, saldo: 2979.5 },
  { fecha: '16/11 21:40', det: 'Cierre Caja 1 · depósito del día', cuenta: 'Efectivo', monto: 1240, saldo: 3029.5 },
  { fecha: '16/11 18:12', det: 'Adelanto a Carlos Huamán', cuenta: 'Efectivo', monto: -40, saldo: 1789.5 },
];

function GeneralView() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-px overflow-hidden rounded-srf bg-line shadow-[0_0_0_1px_hsl(var(--line))] sm:grid-cols-3">
        {cuentas.map((c) => (
          <div key={c.nombre} className="flex flex-col gap-1 bg-surface px-4 py-3.5">
            <div className="flex items-center justify-between text-meta text-ink-muted">
              {c.nombre}
              <button className="font-medium text-ink hover:underline">Contar</button>
            </div>
            <div className="text-kpi font-semibold tabular-nums text-ink">{formatCurrency(c.saldo)}</div>
            <div className="flex items-center gap-1.5 text-meta text-ink-muted">
              <span className={cn('size-1.5 rounded-full', c.ok === true ? 'bg-ok' : c.ok === false ? 'bg-warn' : 'bg-ink-muted/40')} />
              {c.arqueo}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-srf bg-surface shadow-[0_0_0_1px_hsl(var(--line))]">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <div className="relative w-full sm:w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input placeholder="Buscar movimiento" className={cn(fieldCls, 'h-8 pl-8')} />
          </div>
          <div className="flex gap-0.5 rounded-ctl bg-ink/[0.04] p-0.5">
            {['Todas', 'Efectivo', 'Yape', 'Plin'].map((t, i) => (
              <button key={t} className={cn('h-7 rounded-[5px] px-2.5 text-table', i === 0 ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_hsl(var(--line))]' : 'text-ink-muted')}>{t}</button>
            ))}
          </div>
          <span className="ml-auto text-meta text-ink-muted">Noviembre 2026</span>
        </div>
        <table className="mt-2 w-full border-separate border-spacing-0 text-table">
          <thead>
            <tr className="text-meta text-ink-muted">
              <th className="w-28 border-b border-line px-3 py-2 text-left font-medium">Fecha</th>
              <th className="border-b border-line px-3 py-2 text-left font-medium">Detalle</th>
              <th className="hidden border-b border-line px-3 py-2 text-left font-medium sm:table-cell">Cuenta</th>
              <th className="border-b border-line px-3 py-2 text-right font-medium">Monto</th>
              <th className="hidden border-b border-line px-3 py-2 text-right font-medium md:table-cell">Saldo de la cuenta</th>
            </tr>
          </thead>
          <tbody>
            {movsGeneral.map((m) => (
              <tr key={m.fecha + m.det} className="hover:bg-surface-2">
                <td className="h-10 border-b border-line px-3 tabular-nums text-ink-muted">{m.fecha}</td>
                <td className="border-b border-line px-3 text-ink">{m.det}</td>
                <td className="hidden border-b border-line px-3 text-ink-muted sm:table-cell">{m.cuenta}</td>
                <td className="border-b border-line px-3 text-right font-medium"><Money v={m.monto} sign /></td>
                <td className="hidden border-b border-line px-3 text-right tabular-nums text-ink-muted md:table-cell">{formatCurrency(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2.5 text-meta text-ink-muted">Garantías de envase por devolver: S/ 48.00 (no están en el saldo).</div>
      </section>
    </div>
  );
}

// ── "Sacar dinero" de la caja: una pregunta, luego solo los campos de esa opción ──
export function SalidaSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [para, setPara] = useState<'general' | 'proveedor' | 'gasto'>('proveedor');
  const opciones: [typeof para, string, string][] = [
    ['general', 'Llevar a Caja General', 'Excedente o depósito del día'],
    ['proveedor', 'Pagar a un proveedor', 'Salda una compra por pagar'],
    ['gasto', 'Pagar un gasto', 'Luz, transporte, adelanto…'],
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="dp fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-surface shadow-[0_0_48px_-12px_rgba(0,0,0,.3)]">
          <div className="border-b border-line px-5 py-4">
            <Dialog.Title className="text-section font-semibold text-ink">Sacar dinero de Caja 1</Dialog.Title>
            <Dialog.Description className="text-meta text-ink-muted">Hay S/ 1,066.30 en efectivo.</Dialog.Description>
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Para qué">
              {opciones.map(([k, t, d]) => (
                <button key={k} role="radio" aria-checked={para === k} onClick={() => setPara(k)}
                  className={cn('flex items-center gap-3 rounded-ctl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40', para === k ? 'bg-brand-soft shadow-[inset_0_0_0_1px_hsl(var(--brand))]' : 'shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] hover:bg-surface-2')}>
                  <span className={cn('grid size-4 place-items-center rounded-full', para === k ? 'bg-brand' : 'shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]')}>
                    {para === k && <span className="size-1.5 rounded-full bg-white" />}
                  </span>
                  <span><span className="block text-table font-medium text-ink">{t}</span><span className="block text-meta text-ink-muted">{d}</span></span>
                </button>
              ))}
            </div>
            {para === 'proveedor' && (<>
              <Field label="Compra por pagar">
                <select className={fieldCls}><option>OC-000703 · Distribuidora Peruana · debe S/ 1,284.60</option><option>OC-000695 · Golosinas Pachacámac · debe S/ 455.20</option></select>
              </Field>
              <Field label="Monto"><input className={cn(fieldCls, 'text-right tabular-nums')} defaultValue="500.00" /></Field>
            </>)}
            {para === 'general' && <Field label="Monto"><input className={cn(fieldCls, 'text-right tabular-nums')} defaultValue="300.00" /></Field>}
            {para === 'gasto' && (<>
              <Field label="Categoría"><select className={fieldCls}><option>Transporte</option><option>Servicios</option><option>Personal</option></select></Field>
              <Field label="Detalle"><input className={fieldCls} defaultValue="Taxi para recoger pedido" /></Field>
              <Field label="Monto"><input className={cn(fieldCls, 'text-right tabular-nums')} defaultValue="15.00" /></Field>
            </>)}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Dialog.Close asChild><Btn>Cancelar</Btn></Dialog.Close>
            <Btn variant="primary">Registrar salida</Btn>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Cierre de caja: una tabla, una conclusión ────────────────────────────────
export function CierreDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const filas = [
    { m: 'Efectivo', esperado: 1066.3, contado: 1062.3 },
    { m: 'Yape', esperado: 612.4, contado: 612.4 },
    { m: 'Plin', esperado: 0, contado: 0 },
  ];
  const dif = filas.reduce((n, f) => n + f.contado - f.esperado, 0);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="dp fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-srf bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--line))]">
          <div className="px-5 pb-2 pt-5">
            <Dialog.Title className="text-section font-semibold text-ink">Cerrar Caja 1</Dialog.Title>
            <Dialog.Description className="text-meta text-ink-muted">Cuenta el efectivo y confirma lo que llegó por Yape y Plin.</Dialog.Description>
          </div>
          <table className="w-full border-separate border-spacing-0 text-table">
            <thead>
              <tr className="text-meta text-ink-muted">
                <th className="border-b border-line px-5 py-2 text-left font-medium">Medio</th>
                <th className="border-b border-line px-2 py-2 text-right font-medium">Debe haber</th>
                <th className="w-32 border-b border-line px-2 py-2 text-right font-medium">Hay</th>
                <th className="border-b border-line px-5 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const d = f.contado - f.esperado;
                return (
                  <tr key={f.m}>
                    <td className="h-12 border-b border-line px-5 font-medium text-ink">{f.m}</td>
                    <td className="border-b border-line px-2 text-right tabular-nums text-ink-muted">{formatCurrency(f.esperado)}</td>
                    <td className="border-b border-line px-2"><input className={cn(fieldCls, 'h-8 text-right tabular-nums')} defaultValue={f.contado.toFixed(2)} aria-label={`${f.m} contado`} /></td>
                    <td className={cn('border-b border-line px-5 text-right font-medium tabular-nums', Math.abs(d) < 0.005 ? 'text-ink-muted' : 'text-bad-ink')}>
                      {Math.abs(d) < 0.005 ? 'Cuadra' : <Money v={d} sign />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2 px-5 py-3 text-table">
            <span className="size-1.5 rounded-full bg-warn" />
            <span className="text-ink">Faltan <span className="font-medium tabular-nums">{formatCurrency(Math.abs(dif))}</span> en efectivo.</span>
          </div>
          <div className="px-5 pb-4"><Field label="Nota del cierre"><input className={fieldCls} placeholder="Opcional" /></Field></div>
          <div className="flex items-center justify-between gap-2 rounded-b-srf bg-surface-2 px-5 py-3">
            <label className="flex items-center gap-2 text-table text-ink"><input type="checkbox" defaultChecked className="accent-[hsl(var(--brand))]" />Pasar el efectivo a Caja General</label>
            <div className="flex gap-2">
              <Dialog.Close asChild><Btn>Volver</Btn></Dialog.Close>
              <Btn variant="primary">Cerrar caja</Btn>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CajaView({ tab, onTab, onSalida, onCerrar }: {
  tab: CajaTab; onTab: (t: CajaTab) => void; onSalida: () => void; onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Caja"
        actions={tab === 'general'
          ? <><Btn><ArrowLeftRight />Traspasar</Btn><Btn variant="primary"><Plus />Registrar gasto</Btn></>
          : <><Btn><Printer />Imprimir arqueo</Btn><Btn><Plus />Abrir otra caja</Btn></>}
      />
      <Tabs value={tab} onChange={onTab} />
      {tab === 'hoy' && <HoyView onSalida={onSalida} onCerrar={onCerrar} />}
      {tab === 'general' && <GeneralView />}
      {(tab === 'cierres' || tab === 'prestamos') && (
        <div className="rounded-srf bg-surface px-4 py-14 text-center text-table text-ink-muted shadow-[0_0_0_1px_hsl(var(--line))]">
          Misma tabla de siempre, con la plantilla de lista (filtros, orden y exportar).
        </div>
      )}
    </div>
  );
}
