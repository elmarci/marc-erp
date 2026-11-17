// Ruta temporal /design-preview: concepto del rediseño (Fase 5) con datos de
// ejemplo. No toca la API ni las pantallas reales. Se borra al terminar.
//   ?vista=formulario   abre la plantilla de formulario
//   ?anular=1           abre el diálogo de confirmación
//   ?buscar=1           abre el buscador
//   ?tabla=cargando|vacio|error   muestra los estados de la tabla
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CommandPalette, Sidebar, Topbar } from './Shell';
import { ListView, type TableState } from './ListView';
import { ConfirmDialog, FormView } from './FormView';
import { compras, type CompraDemo } from './data';
import { CajaView, CierreDialog, SalidaSheet, type CajaTab } from './CajaView';

export function DesignPreviewPage() {
  const [params, setParams] = useSearchParams();
  const vista = (['formulario', 'caja'].includes(params.get('vista') ?? '') ? params.get('vista') : 'lista') as 'lista' | 'formulario' | 'caja';
  const cajaTab = (params.get('caja') as CajaTab) || 'hoy';
  const [salida, setSalida] = useState(params.get('salida') === '1');
  const [cierre, setCierre] = useState(params.get('cierre') === '1');
  const tableState = (params.get('tabla') as TableState) || 'datos';
  const [collapsed, setCollapsed] = useState(params.get('menu') === 'chico');
  const [mobileOpen, setMobileOpen] = useState(params.get('menu') === 'abierto');
  const [search, setSearch] = useState(params.get('buscar') === '1');
  const [toVoid, setToVoid] = useState<CompraDemo | null>(params.get('anular') ? compras[0] : null);

  const go = (v: 'lista' | 'formulario' | 'caja', extra?: Record<string, string>) => {
    const p = new URLSearchParams(params);
    if (v === 'lista') p.delete('vista'); else p.set('vista', v);
    Object.entries(extra ?? {}).forEach(([k, val]) => p.set(k, val));
    setParams(p);
  };

  return (
    <div
      className="dp flex min-h-screen bg-canvas font-sans text-body text-ink antialiased"
      style={{ ['--dp-sidebar' as string]: collapsed ? '60px' : '232px' }}
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        active={vista === 'caja' ? 'Caja' : 'Compras'}
        onNavigate={(label) => label === 'Caja' ? go('caja') : label === 'Compras' ? go('lista') : undefined}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <Topbar
            crumbs={vista === 'caja' ? ['Dinero', 'Caja'] : vista === 'lista' ? ['Compras e inventario', 'Compras'] : ['Compras e inventario', 'Compras', 'Registrar compra']}
            onSearch={() => setSearch(true)}
            onMenu={() => setMobileOpen(true)}
          />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-5 lg:px-8 lg:py-7">
            {vista === 'caja' ? (
              <CajaView tab={cajaTab} onTab={(t) => go('caja', { caja: t })} onSalida={() => setSalida(true)} onCerrar={() => setCierre(true)} />
            ) : vista === 'lista'
              ? <ListView tableState={tableState} onNew={() => go('formulario')} onVoid={setToVoid} />
              : <FormView onCancel={() => go('lista')} pagoInicial={(params.get('pago') as 'ahora' | 'credito' | 'pagador') || 'ahora'} />}
          </main>
        </div>
      </div>
      <SalidaSheet open={salida} onOpenChange={setSalida} />
      <CierreDialog open={cierre} onOpenChange={setCierre} />
      <CommandPalette open={search} onOpenChange={setSearch} />
      <ConfirmDialog compra={toVoid} onOpenChange={(o) => !o && setToVoid(null)} />
    </div>
  );
}
