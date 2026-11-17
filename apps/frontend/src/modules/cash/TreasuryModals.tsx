// Ventanas de Caja General: depositar, traspasar entre cuentas y arqueo (contar).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Btn, Field, Modal, fieldCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency } from '@/lib/utils';
import { Diff } from './parts';
import { TREASURY_ACCOUNT_LABELS, balanceOf, isZero, type TreasuryAccount, type TreasuryBalances } from './types';

const ACCOUNTS = Object.entries(TREASURY_ACCOUNT_LABELS) as Array<[TreasuryAccount, string]>;
const moneyCls = cn(fieldCls, 'text-right tabular-nums');

function AccountSelect({ value, onChange }: { value: TreasuryAccount; onChange: (v: TreasuryAccount) => void }) {
  return (
    <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value as TreasuryAccount)}>
      {ACCOUNTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

/* ─── Arqueo de Caja General ─────────────────────────────────────────────
   Compara el saldo del sistema contra el conteo y, si hay diferencia, el
   backend registra un ajuste para que el sistema quede igual al conteo. */
export function ReconcileModal({ balances, initialAccount = 'CASH', onClose }: {
  balances: TreasuryBalances | undefined; initialAccount?: TreasuryAccount; onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [account, setAccount] = useState<TreasuryAccount>(initialAccount);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const expected = balanceOf(balances, account);
  const difference = counted !== '' ? Number(counted) - expected : null;

  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/reconcile', { account, countedAmount: parseFloat(counted), notes: notes || undefined }),
    onSuccess: () => {
      invalidate('treasury-balance', 'treasury-movements', 'treasury-reconciliations');
      toast.success('Arqueo registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Arqueo de Caja General"
      description="Cuenta lo que hay de verdad en la cuenta y compáralo con el sistema."
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" disabled={counted === ''} loading={mutation.isPending} onClick={() => mutation.mutate()}>Registrar arqueo</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuenta"><AccountSelect value={account} onChange={setAccount} /></Field>
          <Field label="Saldo en el sistema"><div className="flex h-9 items-center justify-end font-medium tabular-nums text-ink">{formatCurrency(expected)}</div></Field>
        </div>
        <Field label="Conteo real (S/)">
          <input type="number" inputMode="decimal" min={0} step={0.01} autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} className={moneyCls} />
        </Field>
        {difference !== null && (
          <div className="flex items-center justify-between rounded-ctl bg-surface-2 px-3 py-2 text-table">
            <span className="text-ink-muted">Diferencia</span><Diff v={difference} />
          </div>
        )}
        {difference !== null && !isZero(difference) && (
          <p className="text-meta text-ink-muted">Se registrará un ajuste de {difference > 0 ? 'depósito' : 'retiro'} para cuadrar el sistema.</p>
        )}
        <Field label="Notas"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo de la diferencia, si hay…" /></Field>
      </div>
    </Modal>
  );
}

export function DepositModal({ onClose }: { onClose: () => void }) {
  const invalidate = useInvalidate();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState<TreasuryAccount>('CASH');
  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/deposits', { amount: parseFloat(amount), description, account }),
    onSuccess: () => { invalidate('treasury-balance', 'treasury-movements'); toast.success('Depósito registrado.'); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Registrar depósito"
      description="Dinero que entra a Caja General desde afuera, por ejemplo un aporte de capital."
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending}
        disabled={!(parseFloat(amount) > 0) || !description} onClick={() => mutation.mutate()}>Confirmar depósito</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (S/)"><input type="number" inputMode="decimal" min={0.01} step={0.01} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={moneyCls} /></Field>
          <Field label="Cuenta"><AccountSelect value={account} onChange={setAccount} /></Field>
        </div>
        <Field label="Descripción"><input className={fieldCls} placeholder="Ej: Aporte de capital" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/* Traspaso entre cuentas (ej. sacar S/ 200 de Yape y meterlos a Efectivo): no es
   gasto ni ingreso, solo cambia de formato. */
export function TransferModal({ balances, onClose }: { balances: TreasuryBalances | undefined; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [from, setFrom] = useState<TreasuryAccount>('YAPE');
  const [to, setTo] = useState<TreasuryAccount>('CASH');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const same = from === to;
  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/transfers', { fromAccount: from, toAccount: to, amount: parseFloat(amount), notes: notes || undefined }),
    onSuccess: () => { invalidate('treasury-balance', 'treasury-movements', 'treasury-transfers'); toast.success('Traspaso registrado.'); onClose(); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Traspasar entre cuentas"
      description="Para cuando el dinero solo cambia de formato. No afecta gastos ni ingresos."
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending}
        disabled={!(parseFloat(amount) > 0) || same} onClick={() => mutation.mutate()}>Confirmar traspaso</Btn></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="De" hint={`Saldo: ${formatCurrency(balanceOf(balances, from))}`}><AccountSelect value={from} onChange={setFrom} /></Field>
          <Field label="A" error={same ? 'No puede ser la misma cuenta.' : undefined}
            hint={`Saldo: ${formatCurrency(balanceOf(balances, to))}`}><AccountSelect value={to} onChange={setTo} /></Field>
        </div>
        <Field label="Monto (S/)"><input type="number" inputMode="decimal" min={0.01} step={0.01} autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={moneyCls} /></Field>
        <Field label="Notas (opcional)"><input className={fieldCls} placeholder="Ej: vuelto a clientes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
