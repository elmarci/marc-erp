// Ruta temporal /design-preview: concepto del rediseño (Fase 5) con datos de
// ejemplo. No toca la API ni las pantallas reales. Se borra al terminar.
//   ?vista=formulario   abre la plantilla de formulario
//   ?anular=1           abre el diálogo de confirmación
//   ?buscar=1           abre el buscador
//   ?tabla=cargando|vacio|error   muestra los estados de la tabla
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CommandPalette, Sidebar, Topbar } from './Shell';
import { ListView, type TableState } from './ListView';
import { ConfirmDialog, FormView } from './FormView';
import { compras, type CompraDemo } from './data';

export function DesignPreviewPage() {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'formulario' ? 'formulario' : 'lista';
  const tableState = (params.get('tabla') as TableState) || 'datos';
  const [collapsed, setCollapsed] = useState(params.get('menu') === 'chico');
  const [mobileOpen, setMobileOpen] = useState(params.get('menu') === 'abierto');
  const [search, setSearch] = useState(params.get('buscar') === '1');
  const [toVoid, setToVoid] = useState<CompraDemo | null>(params.get('anular') ? compras[0] : null);

  const go = (v: 'lista' | 'formulario') => {
    const p = new URLSearchParams(params);
    if (v === 'lista') p.delete('vista'); else p.set('vista', v);
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
        active="Compras"
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className={cn('flex min-h-0 flex-1 flex-col bg-surface lg:rounded-srf lg:shadow-[0_0_0_1px_hsl(var(--line))]')}>
          <Topbar
            crumbs={vista === 'lista' ? ['Compras e inventario', 'Compras'] : ['Compras e inventario', 'Compras', 'Registrar compra']}
            onSearch={() => setSearch(true)}
            onMenu={() => setMobileOpen(true)}
          />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-5 lg:px-8 lg:py-7">
            {vista === 'lista'
              ? <ListView tableState={tableState} onNew={() => go('formulario')} onVoid={setToVoid} />
              : <FormView onCancel={() => go('lista')} />}
          </main>
        </div>
      </div>
      <CommandPalette open={search} onOpenChange={setSearch} />
      <ConfirmDialog compra={toVoid} onOpenChange={(o) => !o && setToVoid(null)} />
    </div>
  );
}
