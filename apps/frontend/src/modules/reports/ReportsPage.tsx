// Reportes: pestañas de ventas, margen, utilidad, inventario, top y cobranzas.
import { useState } from 'react';
import { TrendingUp, Package, Trophy, Wallet, DollarSign, PiggyBank } from 'lucide-react';
import { PageHeader, PageTabs } from '@/components/erp';
import { InventoryTab, SalesTab, TopProductsTab } from './SalesTabs';
import { AccountsReceivableTab, MarginTab, NetProfitTab } from './ProfitTabs';

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function ReportsPage() {
  const [tab, setTab] = useState<'sales' | 'margin' | 'netprofit' | 'inventory' | 'products' | 'receivable'>('sales');

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Reportes">
        <p className="text-table text-ink-muted">Análisis de ventas, inventario y productos</p>
      </PageHeader>
      <PageTabs value={tab} onChange={setTab} tabs={([
        ['sales', TrendingUp, 'Ventas'],
        ['margin', DollarSign, 'Margen'],
        ['netprofit', PiggyBank, 'Utilidad Neta'],
        ['inventory', Package, 'Inventario'],
        ['products', Trophy, 'Top Productos'],
        ['receivable', Wallet, 'Cuentas por Cobrar'],
      ] as const).map(([key, Icon, label]) => [key, <span key={key} className="inline-flex items-center gap-1.5"><Icon className="size-4" />{label}</span>] as const)} />

      {tab === 'sales' && <SalesTab />}
      {tab === 'margin' && <MarginTab />}
      {tab === 'netprofit' && <NetProfitTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'products' && <TopProductsTab />}
      {tab === 'receivable' && <AccountsReceivableTab />}
    </div>
  );
}
