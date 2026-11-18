import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageTabs, StatCard, StatGrid } from '@/components/erp';
import { api } from '@/services/api';
import { formatCurrency, cn } from '@/lib/utils';
import { OrdersTab } from './OrdersTab';
import { PayableTab } from './PayableTab';
import { PayersTab } from './PayersTab';
import { SettlementsTab } from './SettlementsTab';
import { SuppliersTab } from './SuppliersTab';

export interface PurchasesDashboard {
  treasury: { cash: number; yape: number; plin: number; total: number };
  payableToSuppliers: number;
  payableToPayers: number;
}

export function PurchasesDashboardBar() {
  const { data } = useQuery({
    queryKey: ['purchases-dashboard'],
    queryFn: async () => (await api.get<{ data: PurchasesDashboard }>('/purchases/dashboard')).data.data,
  });
  const money = (n: number | undefined, debt = false) => n === undefined ? '…'
    : <span className={cn(debt && n > 0.009 && 'text-bad-ink')}>{formatCurrency(n)}</span>;

  return (
    <StatGrid cols={5}>
      <StatCard label="Caja General · efectivo" value={money(data?.treasury.cash)} />
      <StatCard label="Caja General · Yape" value={money(data?.treasury.yape)} />
      <StatCard label="Caja General · Plin" value={money(data?.treasury.plin)} />
      <StatCard label="Por pagar a proveedores" value={money(data?.payableToSuppliers, true)} />
      <StatCard label="Por pagar a pagadores" value={money(data?.payableToPayers, true)} />
    </StatGrid>
  );
}

type PurchasesTab = 'orders' | 'payable' | 'settlements' | 'payers' | 'suppliers';
const TABS: readonly PurchasesTab[] = ['orders', 'payable', 'settlements', 'payers', 'suppliers'];

/* ─── Página ─────────────────────────────────────────────────────────────── */
export function PurchasesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as PurchasesTab | null;
  const tab: PurchasesTab = raw && TABS.includes(raw) ? raw : 'orders';
  // La pestaña va en el enlace (?tab=) para poder compartirla y volver a ella.
  const setTab = (t: PurchasesTab) => setParams(() => {
    const next = new URLSearchParams();
    if (t !== 'orders') next.set('tab', t);
    return next;
  }, { replace: true });

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Compras y proveedores" />
      <PurchasesDashboardBar />
      <PageTabs value={tab} onChange={setTab} tabs={[
        ['orders', 'Órdenes de compra'],
        ['payable', 'Cuentas por pagar'],
        ['settlements', 'Liquidaciones'],
        ['payers', 'Pagadores'],
        ['suppliers', 'Proveedores'],
      ]} />

      {tab === 'orders' ? <OrdersTab />
        : tab === 'payable' ? <PayableTab />
        : tab === 'settlements' ? <SettlementsTab />
        : tab === 'payers' ? <PayersTab />
        : <SuppliersTab />}
    </div>
  );
}
