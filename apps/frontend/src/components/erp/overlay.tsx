// Ventanas: diálogo centrado, panel lateral y confirmación propia.
// useConfirm() reemplaza a window.confirm(): devuelve una promesa con true/false
// y la confirmación siempre nombra el objeto afectado.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, Field, fieldCls } from './primitives';

const overlayCls = 'fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-in data-[state=open]:fade-in-0';
const shadowCls = 'shadow-[0_24px_64px_-16px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--line))]';

function CloseX() {
  return (
    <Dialog.Close className="tap grid size-8 shrink-0 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink" aria-label="Cerrar">
      <X className="size-4" />
    </Dialog.Close>
  );
}

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Formularios largos: no se cierra con clic afuera ni con Esc (solo con la X o Cancelar). */
  keepOpen?: boolean;
}

const widths = { sm: 'max-w-[440px]', md: 'max-w-[560px]', lg: 'max-w-[760px]', xl: 'max-w-[960px]' };

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', keepOpen }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayCls} />
        <Dialog.Content
          onInteractOutside={keepOpen ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={keepOpen ? (e) => e.preventDefault() : undefined}
          className={cn('erp fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-srf bg-surface', widths[size], shadowCls)}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-section font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-table text-ink-muted">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>}
            </div>
            <CloseX />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-srf border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Panel que entra por la derecha (en celular ocupa toda la pantalla). */
export function Sheet({ open, onOpenChange, title, description, children, footer, size = 'md', keepOpen }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayCls} />
        <Dialog.Content
          onInteractOutside={keepOpen ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={keepOpen ? (e) => e.preventDefault() : undefined}
          className={cn('erp fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-[0_0_48px_-12px_rgba(0,0,0,.3)]',
            size === 'sm' ? 'sm:max-w-[400px]' : size === 'md' ? 'sm:max-w-[480px]' : 'sm:max-w-[640px]')}
        >
          <div className="flex items-start gap-3 border-b border-line bg-surface-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-section font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-table text-ink-muted">{description}</Dialog.Description>
                : <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>}
            </div>
            <CloseX />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Confirmación ───────────────────────────────────────────────────────────
export interface ConfirmOptions {
  /** Debe nombrar el objeto: "Anular compra OC-000703". */
  title: string;
  /** Qué pasa con el dinero, el stock o los datos. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Pide un motivo obligatorio y lo devuelve en onConfirm. */
  reason?: { label: string; placeholder?: string; defaultValue?: string; optional?: boolean };
}

export function ConfirmDialog({
  open, onOpenChange, onConfirm, loading, ...o
}: ConfirmOptions & {
  open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason?: string) => void; loading?: boolean;
}) {
  const [reason, setReason] = useState(o.reason?.defaultValue ?? '');
  const needsReason = !!o.reason && !o.reason.optional;
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setReason(o.reason?.defaultValue ?? ''); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayCls} />
        <Dialog.Content
          role="alertdialog"
          className={cn('erp fixed left-1/2 top-1/2 z-50 w-[calc(100%-24px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-srf bg-surface', shadowCls)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (!needsReason || reason.trim()) && !loading) { e.preventDefault(); onConfirm(o.reason ? reason.trim() : undefined); } }}
        >
          <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
            <Dialog.Title className="text-section font-semibold text-ink">{o.title}</Dialog.Title>
            {o.description ? <Dialog.Description asChild><div className="text-body text-ink-muted">{o.description}</div></Dialog.Description>
              : <Dialog.Description className="sr-only">{o.title}</Dialog.Description>}
            {o.reason && (
              <Field label={o.reason.label} className="mt-2" required={!o.reason.optional}>
                <input autoFocus className={fieldCls} value={reason} placeholder={o.reason.placeholder} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2 rounded-b-srf bg-surface-2 px-5 py-3">
            <Dialog.Close asChild><Btn>{o.cancelLabel ?? 'Volver'}</Btn></Dialog.Close>
            <Btn
              autoFocus={!o.reason}
              variant={o.tone === 'primary' ? 'primary' : 'danger'}
              loading={loading}
              disabled={needsReason && !reason.trim()}
              onClick={() => onConfirm(o.reason ? reason.trim() : undefined)}
            >
              {o.confirmLabel ?? 'Confirmar'}
            </Btn>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ConfirmFn = (o: ConfirmOptions) => Promise<{ ok: boolean; reason?: string }>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** Montar una vez arriba de la app. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((r: { ok: boolean; reason?: string }) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => {
    resolver.current?.({ ok: false });
    resolver.current = resolve;
    setState(o);
  }), []);

  const finish = (r: { ok: boolean; reason?: string }) => {
    resolver.current?.(r);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          key={state.title}
          open
          {...state}
          onOpenChange={(v) => { if (!v) finish({ ok: false }); }}
          onConfirm={(reason) => finish({ ok: true, reason })}
        />
      )}
    </ConfirmCtx.Provider>
  );
}

/**
 * const confirm = useConfirm();
 * if ((await confirm({ title: `Eliminar "${p.name}"`, confirmLabel: 'Eliminar' })).ok) remove();
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm necesita <ConfirmProvider> arriba en el árbol');
  return ctx;
}
