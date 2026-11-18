import { Btn, Modal as ErpModal } from '@/components/erp';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';

/* ─── Comprobante del proveedor ─────────────────────────────────────────── */

export const DOC_TYPE_LABELS: Record<string, string> = {
  FACTURA: 'Factura',
  BOLETA: 'Boleta',
  TICKET: 'Ticket',
  NOTA_VENTA: 'Nota de venta',
  RECIBO_SERVICIO: 'Recibo de servicio',
  RECIBO_HONORARIOS: 'Recibo por honorarios',
  OTHER: 'Otro',
};

export interface SupplierDoc {
  docType: string;
  docSeries: string;
  docNumber: string;
  docIssueDate: string; // YYYY-MM-DD
  supplierTaxId: string;
}

export const emptyDoc = (): SupplierDoc => ({ docType: '', docSeries: '', docNumber: '', docIssueDate: '', supplierTaxId: '' });

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
/** Mismo control que el backend: 11 dígitos, prefijo y dígito verificador. */
export function isValidRuc(value: string | null | undefined): boolean {
  if (!value || !/^\d{11}$/.test(value)) return false;
  if (!['10', '15', '16', '17', '20'].includes(value.slice(0, 2))) return false;
  const sum = RUC_WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0);
  return (11 - (sum % 11)) % 10 === Number(value[10]);
}

/** Lo que se manda al backend, o undefined si no se llenó nada. */
export function docPayload(doc: SupplierDoc) {
  if (!doc.docType && !doc.docSeries.trim() && !doc.docNumber.trim()) return undefined;
  return {
    docType: doc.docType || null,
    docSeries: doc.docSeries.trim() || null,
    docNumber: doc.docNumber.trim() || null,
    docIssueDate: doc.docIssueDate ? new Date(`${doc.docIssueDate}T12:00:00`).toISOString() : null,
    supplierTaxId: doc.supplierTaxId.trim() || null,
  };
}

/** Falta algo para poder guardar (factura sin serie/número o sin RUC válido). */
export function docProblem(doc: SupplierDoc, supplierTaxId: string | null | undefined): string | null {
  const typed = doc.supplierTaxId.trim();
  if (typed && typed !== (supplierTaxId ?? '') && !isValidRuc(typed)) return 'El RUC escrito no es válido: revisa los 11 dígitos.';
  if (doc.docType !== 'FACTURA') return null;
  if (!doc.docSeries.trim() || !doc.docNumber.trim()) return 'Escribe la serie y el número de la factura.';
  if (!isValidRuc(supplierTaxId) && !isValidRuc(doc.supplierTaxId.trim())) return 'Falta un RUC válido del proveedor.';
  return null;
}

export function SupplierDocFields({ value, onChange, supplierTaxId, className, editableRuc }: {
  value: SupplierDoc;
  onChange: (doc: SupplierDoc) => void;
  supplierTaxId?: string | null;
  className?: string;
  /** Muestra siempre el RUC (lleno con el del proveedor) para poder corregirlo. */
  editableRuc?: boolean;
}) {
  const set = (patch: Partial<SupplierDoc>) => onChange({ ...value, ...patch });
  const needsRuc = editableRuc || (value.docType === 'FACTURA' && !isValidRuc(supplierTaxId));
  const rucTyped = value.supplierTaxId.trim();
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      <div>
        <label className="mb-1 block text-body font-medium">Comprobante</label>
        <Select value={value.docType} onChange={(e) => set({ docType: e.target.value })}>
          <option value="">Sin comprobante</option>
          {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-body font-medium">Serie</label>
        <Input value={value.docSeries} maxLength={10} placeholder="F001"
          onChange={(e) => set({ docSeries: e.target.value.toUpperCase() })} />
      </div>
      <div>
        <label className="mb-1 block text-body font-medium">Número</label>
        <Input value={value.docNumber} maxLength={20} inputMode="numeric" placeholder="123"
          onChange={(e) => set({ docNumber: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-body font-medium">Fecha de emisión</label>
        <Input type="date" value={value.docIssueDate} onChange={(e) => set({ docIssueDate: e.target.value })} />
      </div>
      {needsRuc && (
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1 block text-body font-medium">{editableRuc ? 'RUC del proveedor' : 'RUC del proveedor (está en la factura)'}</label>
          <Input value={value.supplierTaxId} maxLength={11} inputMode="numeric" placeholder="11 dígitos"
            onChange={(e) => set({ supplierTaxId: e.target.value.replace(/\D/g, '') })} />
          <p className={cn('mt-1 text-meta', rucTyped.length === 11 && !isValidRuc(rucTyped) ? 'text-bad-ink' : 'text-ink-muted')}>
            {rucTyped.length === 11 && !isValidRuc(rucTyped)
              ? 'Ese RUC no pasa la verificación. Revisa los 11 dígitos.'
              : editableRuc
                ? (rucTyped && rucTyped !== (supplierTaxId ?? '') ? 'Cambiaste el RUC: se guarda en la ficha del proveedor.' : 'Viene de la ficha del proveedor. Si lo corriges, se actualiza ahí.')
                : supplierTaxId
                  ? `El RUC guardado (${supplierTaxId}) no es válido. Se reemplaza por este.`
                  : 'Se guarda en la ficha del proveedor para las próximas facturas.'}
          </p>
        </div>
      )}
    </div>
  );
}

// Envoltura sobre la ventana común del ERP (misma firma de antes).
function Modal({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  return (
    <ErpModal open onOpenChange={(v) => { if (!v) onClose(); }} size={wide ? 'lg' : 'md'} keepOpen
      title={title} description={subtitle} footer={footer}>
      <div className="space-y-4">{children}</div>
    </ErpModal>
  );
}

interface OrderDocInfo {
  id: string; orderNumber: string;
  docType?: string | null; docSeries?: string | null; docNumber?: string | null; docIssueDate?: string | null;
  supplierInvoice?: string | null;
  supplier: { businessName: string; taxId: string | null };
}

export function EditDocumentModal({ order, onClose }: { order: OrderDocInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<SupplierDoc>({
    docType: order.docType ?? '',
    docSeries: order.docSeries ?? '',
    docNumber: order.docNumber ?? '',
    docIssueDate: order.docIssueDate ? order.docIssueDate.slice(0, 10) : '',
    supplierTaxId: '',
  });
  const problem = docProblem(doc, order.supplier.taxId);
  const mutation = useMutation({
    mutationFn: () => api.patch(`/purchases/${order.id}/document`, docPayload(doc) ?? { docType: null, docSeries: null, docNumber: null, docIssueDate: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', order.id] });
      toast.success('Comprobante guardado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <Modal
      title="Comprobante del proveedor"
      subtitle={`${order.orderNumber} · ${order.supplier.businessName}`}
      onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => mutation.mutate()} disabled={!!problem} loading={mutation.isPending}>Guardar</Btn>
      </>}
    >
      {order.supplierInvoice && !order.docNumber && (
        <p className="rounded-srf bg-surface-2 p-3 text-meta text-ink-muted">
          Se había anotado como texto: <span className="font-medium text-ink">{order.supplierInvoice}</span>
        </p>
      )}
      <SupplierDocFields value={doc} onChange={setDoc} supplierTaxId={order.supplier.taxId} className="sm:grid-cols-2" />
      {problem && <p className="text-meta text-bad-ink">{problem}</p>}
    </Modal>
  );
}

export { SupplierReturnModal, SupplierReturnsList, type SupplierReturnRow } from './SupplierReturns';
