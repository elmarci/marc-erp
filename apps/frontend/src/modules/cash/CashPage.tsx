// Caja: cajas abiertas hoy, Caja General, historial de cierres y arqueos, y
// préstamos. Los gastos tienen su propia página (/expenses).
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, FileSpreadsheet, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, EmptyState, PageHeader, PageTabs, surfaceCls } from '@/components/erp';
import { api } from '@/services/api';
import { downloadExcel } from '@/lib/exportExcel';
import { OpenSessionModal } from '@/modules/pos/OpenSessionModal';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { ExpenseModal } from './ExpenseForms';
import { HistoryTab } from './HistoryTab';
import { LoansPanel } from './LoansPanel';
import { SessionCard } from './SessionCard';
import { DepositModal, ReconcileModal, TransferModal } from './TreasuryModals';
import { TreasuryTab, useTreasuryBalance } from './TreasuryTab';
import type { CashRegister, CashSession, TreasuryAccount } from './types';

type CashTab = 'hoy' | 'general' | 'cierres' | 'prestamos';
// Nombres de pestaña de enlaces antiguos.
const LEGACY: Record<string, CashTab> = { activas: 'hoy', historial: 'cierres' };
type Dialog = { kind: 'deposit' | 'transfer' | 'expense' } | { kind: 'reconcile'; account?: TreasuryAccount } | null;

export function CashPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { setCashSession } = usePosStore();
  const { hasMinRole } = useAuthStore();
  const canSeeTreasury = hasMinRole('SUPERVISOR');
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const raw = params.get('tab') ?? '';
  const asked = (LEGACY[raw] ?? raw) as CashTab;
  const allowed: CashTab[] = canSeeTreasury ? ['hoy', 'general', 'cierres', 'prestamos'] : ['hoy', 'cierres'];
  const tab: CashTab = allowed.includes(asked) ? asked : 'hoy';
  const setTab = (t: CashTab) => setParams(() => (t === 'hoy' ? new URLSearchParams() : new URLSearchParams({ tab: t })), { replace: true });

  const { data: registers, isLoading } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: async () => (await api.get<{ data: Array<CashRegister & { sessions: CashSession[] }> }>('/cash/registers')).data.data,
    refetchInterval: 30000,
  });
  const { data: balances } = useTreasuryBalance(canSeeTreasury);
  const openSessions: CashSession[] = (registers ?? []).flatMap((r) => r.sessions.map((s) => ({ ...s, cashRegister: { name: r.name } })));

  // Enlace antiguo de la campana de avisos: ?tab=general&section=gastos.
  if (params.get('section') === 'gastos') return <Navigate to="/expenses" replace />;

  const openSessionBtn = <Btn variant={tab === 'hoy' ? 'primary' : 'secondary'} onClick={() => setShowOpenSession(true)}><Plus />Abrir caja</Btn>;

  return (
    <div className="erp flex flex-col gap-5">
      <PageHeader title="Caja" actions={tab === 'general' ? <>
        <Btn onClick={() => setDialog({ kind: 'deposit' })}><Plus />Depositar</Btn>
        <Btn onClick={() => setDialog({ kind: 'transfer' })}><ArrowLeftRight />Traspasar</Btn>
        <Btn variant="primary" onClick={() => setDialog({ kind: 'expense' })}><Plus />Registrar gasto</Btn>
      </> : <>
        <Btn className="hidden sm:inline-flex" onClick={() => downloadExcel('/cash/sessions/export', 'cajas.xlsx')}><FileSpreadsheet />Exportar Excel</Btn>
        {openSessionBtn}
      </>} />

      <PageTabs value={tab} onChange={setTab} tabs={[
        ['hoy', 'Cajas activas', openSessions.length || undefined],
        ...(canSeeTreasury ? [['general', 'Caja General'] as const] : []),
        ['cierres', 'Historial y arqueos'],
        ...(canSeeTreasury ? [['prestamos', 'Préstamos'] as const] : []),
      ]} />

      {tab === 'hoy' && (
        isLoading ? <div className="py-12 text-center text-table text-ink-muted">Cargando…</div>
          : openSessions.length === 0 ? (
            <div className={surfaceCls}><EmptyState icon={Wallet} title="No hay cajas abiertas" action={openSessionBtn} /></div>
          ) : <div className="flex flex-col gap-8">{openSessions.map((s) => <SessionCard key={s.id} session={s} />)}</div>
      )}
      {tab === 'general' && <TreasuryTab onCount={(account) => setDialog({ kind: 'reconcile', account })} />}
      {tab === 'cierres' && <HistoryTab canSeeTreasury={canSeeTreasury} onReconcile={() => setDialog({ kind: 'reconcile' })} />}
      {tab === 'prestamos' && <LoansPanel />}

      {dialog?.kind === 'deposit' && <DepositModal onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferModal balances={balances} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'expense' && <ExpenseModal onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reconcile' && <ReconcileModal balances={balances} initialAccount={dialog.account} onClose={() => setDialog(null)} />}

      {showOpenSession && (
        <OpenSessionModal
          onClose={() => setShowOpenSession(false)}
          onOpened={(sessionId, registerId) => {
            setCashSession(sessionId, registerId);
            setShowOpenSession(false);
            ['cash-registers', 'treasury-balance', 'treasury-movements'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
            toast.success('Caja abierta exitosamente.');
          }}
        />
      )}
    </div>
  );
}
