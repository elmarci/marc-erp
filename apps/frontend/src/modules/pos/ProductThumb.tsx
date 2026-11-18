import { cn } from '@/lib/utils';

/** Foto del producto o, si no tiene, sus iniciales sobre un fondo neutro. */
export function ProductThumb({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className?: string }) {
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg', imageUrl ? 'bg-white' : 'bg-brand-soft', className)}>
      {imageUrl
        ? <img src={imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
        : <span className="text-sm font-bold text-brand/70">{initials}</span>}
    </span>
  );
}
