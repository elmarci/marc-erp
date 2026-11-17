// Ajuste masivo de inventario y ventanas de lotes (resolver vencimiento,
// registrar fecha de vencimiento de stock que entró sin fecha).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Field, Modal, Segmented, fieldCls, tableCls, tdCls, thCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, looksLikeScannedCode } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ADJUSTMENT_REASONS, adjustmentReasonLabel } from './adjustmentReasons';
import { signedQty, type ExpiringBatch, type UncoveredRow } from './types';

const numCls = cn(fieldCls, 'text-right tabular-nums');

/* ─── Ajuste masivo ─────────────────────────────────────────────────────── */
export function BulkAdjustModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState('COUNT');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [items, setItems] = useState<Array<{ productId: string; name: string; systemQty: number; physicalQty: number }>>([]);

  const { data: products } = useQuery({
    queryKey: ['products-adj-search', debouncedSearch],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; currentStock: number }> }>(`/products?q=${debouncedSearch}&limit=15`)).data.data,
    enabled: debouncedSearch.length >= 2,
  });

  const addProduct = (p: { id: string; name: string; currentStock: number }) => {
    if (items.find((i) => i.productId === p.id)) return;
    setItems((v) => [...v, { productId: p.id, name: p.name, systemQty: p.currentStock, physicalQty: p.currentStock }]);
    setSearch('');
  };

  // Escanear el código de barras agrega directo, sin pasar por la lista.
  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    if (!looksLikeScannedCode(value)) return;
    try {
      const res = await api.get<{ data: { id: string; name: string; currentStock: number } }>(`/products/barcode/${value}`);
      addProduct(res.data.data);
    } catch {
      toast.error(`No se encontró ningún producto con código ${value}.`);
    }
  };

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/adjustments', {
      reasonCode, reason: reason.trim().length >= 3 ? reason.trim() : adjustmentReasonLabel(reasonCode),
      notes: notes || undefined,
      items: items.map((i) => ({ productId: i.productId, physicalQuantity: i.physicalQty })),
    }),
    onSuccess: () => {
      ['inv-stock', 'inv-dashboard', 'inv-adjustments'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success('Ajuste de inventario aplicado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const changedCount = items.filter((i) => i.physicalQty !== i.systemQty).length;

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" keepOpen title="Ajuste masivo de inventario"
      footer={<>
        {changedCount > 0 && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-table text-ink">
            <AlertTriangle className="size-4 text-warn" />{changedCount} producto(s) con cambios. No se puede deshacer.
          </span>
        )}
        <Btn onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" loading={mutation.isPending} disabled={items.length === 0 || changedCount === 0} onClick={() => mutation.mutate()}>
          Aplicar ajuste ({changedCount} cambios)
        </Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Motivo">
            <select className={fieldCls} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Detalle (opcional)"><input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: conteo mensual de bebidas" /></Field>
          <Field label="Observaciones" className="sm:col-span-2"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles adicionales…" /></Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-table font-medium text-ink">Agregar producto</span>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input className={cn(fieldCls, 'pl-8')} aria-label="Agregar producto" placeholder="Buscar o escanear código de barras…" value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={handleScanKeyDown} />
          </div>
          {products && products.length > 0 && search.length >= 2 && (
            <div className="max-h-40 divide-y divide-line overflow-y-auto rounded-ctl bg-surface shadow-[0_0_0_1px_hsl(var(--line)),0_8px_24px_-8px_rgba(0,0,0,.2)]">
              {products.map((p) => (
                <button key={p.id} type="button" onClick={() => addProduct(p)}
                  className="flex w-full justify-between px-3 py-2 text-left text-table hover:bg-surface-2">
                  <span className="text-ink">{p.name}</span><span className="text-ink-muted">Stock: {p.currentStock}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="-mx-5">
            <table className={tableCls}>
              <thead><tr>
                <th className={cn(thCls, 'pl-5')}>Producto</th>
                <th className={cn(thCls, 'w-24 text-right')}>Sistema</th>
                <th className={cn(thCls, 'w-28 text-right')}>Físico</th>
                <th className={cn(thCls, 'w-20 text-right')}>Dif.</th>
                <th className={cn(thCls, 'w-12 pr-5')}><span className="sr-only">Quitar</span></th>
              </tr></thead>
              <tbody>
                {items.map((item, idx) => {
                  const diff = item.physicalQty - item.systemQty;
                  return (
                    <tr key={item.productId}>
                      <td className={cn(tdCls, 'pl-5')}>{item.name}</td>
                      <td className={cn(tdCls, 'text-right tabular-nums text-ink-muted')}>{item.systemQty}</td>
                      <td className={tdCls}>
                        <input type="number" min={0} value={item.physicalQty} aria-label={`Físico de ${item.name}`}
                          onChange={(e) => setItems((v) => v.map((i, n) => (n === idx ? { ...i, physicalQty: Number(e.target.value) } : i)))}
                          className={cn(numCls, 'h-8')} />
                      </td>
                      <td className={cn(tdCls, 'text-right font-medium tabular-nums', diff === 0 ? 'text-ink-muted' : diff < 0 && 'text-bad-ink')}>{signedQty(diff)}</td>
                      <td className={cn(tdCls, 'pr-5 text-right')}>
                        <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => setItems((v) => v.filter((_, n) => n !== idx))}
                          className="tap grid size-7 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink"><X className="size-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Resolver lote por vencer (vendido / merma) ────────────────────────── */
export function ResolveBatchModal({ batch, onClose }: { batch: ExpiringBatch; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'sold' | 'loss'>('sold');
  const [lossQty, setLossQty] = useState(String(Math.min(batch.quantity, batch.product.currentStock)));
  const [notes, setNotes] = useState('');
  const maxLoss = batch.product.currentStock;

  const mutation = useMutation({
    mutationFn: () => api.post(`/products/batches/${batch.id}/resolve`, {
      notes: notes || undefined,
      lossQuantity: mode === 'loss' ? Number(lossQty) : undefined,
    }),
    onSuccess: () => {
      ['inv-expiring-batches', 'inv-expiring-batches-count', 'inv-expiry', 'inv-alerts-summary', 'inv-stock', 'inv-dashboard', 'inv-movements']
        .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(mode === 'loss' ? 'Merma registrada. Stock actualizado.' : 'Lote marcado como resuelto.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Resolver alerta de vencimiento" description={batch.product.name}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant={mode === 'loss' ? 'danger' : 'primary'} loading={mutation.isPending}
        disabled={mode === 'loss' && (Number(lossQty) <= 0 || Number(lossQty) > maxLoss)} onClick={() => mutation.mutate()}>Confirmar</Btn></>}>
      <div className="flex flex-col gap-4">
        <Segmented value={mode} onChange={setMode} size="md" ariaLabel="Qué pasó"
          options={[['sold', 'Ya se vendió o rotó'], ['loss', 'Se venció (merma)']]} />
        {mode === 'loss' && (
          <Field label="Unidades vencidas" hint={`Stock actual: ${maxLoss} uds. Descuenta el stock y queda como ajuste por vencimiento (no como gasto).`}>
            <input type="number" min={0} max={maxLoss} autoFocus value={lossQty} onChange={(e) => setLossQty(e.target.value)} className={numCls} />
          </Field>
        )}
        <Field label="Notas (opcional)"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones…" /></Field>
      </div>
    </Modal>
  );
}

/* ─── Registrar fecha de vencimiento de stock que entró sin fecha ─────────── */
export function RegisterBatchModal({ row, onClose }: { row: UncoveredRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(String(row.uncovered));
  const [expiryDate, setExpiryDate] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const qty = Number(quantity);
  const valid = qty > 0 && qty <= row.uncovered + 0.0005 && !!expiryDate;

  const mutation = useMutation({
    mutationFn: () => api.post(`/products/${row.productId}/batches`, {
      quantity: qty, expiryDate: new Date(`${expiryDate}T12:00:00`).toISOString(), batchNumber: batchNumber || undefined,
    }),
    onSuccess: () => {
      ['inv-expiry', 'inv-alerts-summary', 'inv-expiring-batches'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success('Fecha de vencimiento registrada.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" title="Registrar vencimiento" description={row.name}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" loading={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>Guardar</Btn></>}>
      <div className="flex flex-col gap-4">
        <p className="text-table text-ink-muted">
          Hay {row.stock} en stock y {row.covered} ya tienen fecha: quedan <span className="font-medium text-ink">{row.uncovered} {row.unit}</span> sin fecha.
          Si tienen fechas distintas, registra una por una (por cada fecha, la cantidad que corresponde).
        </p>
        <Field label="¿Cuántas vencen en esa fecha?">
          <input type="number" min={0} max={row.uncovered} step="any" autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} className={numCls} />
        </Field>
        <Field label="Fecha de vencimiento" required><input type="date" className={fieldCls} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
        <Field label="N° de lote (opcional)"><input className={fieldCls} value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
