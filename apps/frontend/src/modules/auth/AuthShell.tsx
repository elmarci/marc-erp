// Marco de las pantallas de acceso (login y cambio de contraseña): fondo
// neutro, marca MARC arriba y una tarjeta centrada.
import { cn } from '@/lib/utils';
import { surfaceCls } from '@/components/erp';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="erp flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="grid size-7 place-items-center rounded-[6px] bg-brand text-[12px] font-bold text-white" aria-hidden>M</div>
          <span className="text-section font-semibold tracking-tight text-ink">MARC</span>
          <span className="text-table text-ink-muted">Minimarket</span>
        </div>
        <div className={cn('p-6 sm:p-7', surfaceCls)}>
          <h1 className="text-title font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-table text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
