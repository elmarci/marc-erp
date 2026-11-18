// Tarjetas de Reportes con el estilo del ERP (superficie, título y cuerpo).
import { cn } from '@/lib/utils';
import { surfaceCls } from '@/components/erp';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('min-w-0', surfaceCls, className)}>{children}</section>;
}
export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col gap-1 px-4 pb-2 pt-4', className)}>{children}</div>;
}
export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn('text-section font-semibold text-ink', className)}>{children}</h3>;
}
export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-4 pt-0', className)}>{children}</div>;
}
