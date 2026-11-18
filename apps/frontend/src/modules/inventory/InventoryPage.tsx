// Inventario: página con pestañas. La pestaña va en la dirección (?tab=expiry)
// para que la campana de avisos pueda abrir directo la que corresponde.
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageTabs } from '@/components/erp';
import { api } from '@/services/api';
import { AdjustmentsTab } from './AdjustmentsTab';
import { AlertsTab } from './AlertsTab';
import { ExpiryTab } from './ExpiryTab';
import { MovementsTab } from './MovementsTab';
import { CycleCountTab, NoMovementTab } from './StockHealth';
import { StockTab } from './StockTab';
import { SummaryTab } from './SummaryTab';
import type { AlertsSummary } from './types';

const TAB_KEYS = ['dashboard', 'stock', 'movements', 'adjustments', 'expiry', 'count', 'stale', 'alerts'] as const;
type TabKey = typeof TAB_KEYS[number];

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TAB_KEYS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab') as TabKey : 'dashboard';
  // Al cambiar de pestaña se limpian los filtros de la anterior.
  const setTab = (key: TabKey) => setParams(() => new URLSearchParams(key === 'dashboard' ? {} : { tab: key }), { replace: true });

  const { data: summary } = useQuery({
    queryKey: ['inv-alerts-summary'],
    queryFn: async () => (await api.get<{ data: AlertsSummary }>('/inventory/alerts/summary')).data.data,
    refetchInterval: 60000,
  });
  // Alertas: stock bajo + margen bajo + por vencer. Vencimientos: lo por vencer
  // y el stock sin fecha registrada (lo que hay que completar).
  const alertCount = (summary?.lowStock ?? 0) + (summary?.marginLow ?? 0) + (summary?.expiring ?? 0);
  const expiryCount = (summary?.expiring ?? 0) + (summary?.uncovered ?? 0);

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Inventario">
        <p className="text-table text-ink-muted">Control de stock, movimientos, ajustes y valorización</p>
      </PageHeader>
      <PageTabs value={tab} onChange={setTab} tabs={[
        ['dashboard', 'Resumen'],
        ['stock', 'Stock actual'],
        ['movements', 'Movimientos'],
        ['adjustments', 'Ajustes'],
        ['expiry', 'Vencimientos', expiryCount > 0 ? expiryCount : undefined],
        ['count', 'Conteo'],
        ['stale', 'Sin movimiento'],
        ['alerts', 'Alertas', alertCount > 0 ? alertCount : undefined],
      ]} />

      {tab === 'dashboard' && <SummaryTab />}
      {tab === 'stock' && <StockTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}
      {tab === 'expiry' && <ExpiryTab />}
      {tab === 'count' && <CycleCountTab />}
      {tab === 'stale' && <NoMovementTab />}
      {tab === 'alerts' && <AlertsTab />}
    </div>
  );
}
