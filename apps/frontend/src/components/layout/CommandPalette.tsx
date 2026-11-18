// Buscador global (Ctrl/Cmd + K): salta a cualquier módulo que el rol pueda ver.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Kbd } from '@/components/erp';
import { homeItem, visibleGroups } from './nav';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { hasMinRole } = useAuthStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const rows = useMemo(() => {
    const all = [{ ...homeItem, group: '' }, ...visibleGroups(hasMinRole).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))];
    const t = norm(q.trim());
    if (!t) return all;
    // Primero los que coinciden por nombre, luego los que coinciden por grupo.
    const byName = all.filter((r) => norm(r.label).includes(t));
    return [...byName, ...all.filter((r) => !byName.includes(r) && norm(r.group).includes(t))];
  }, [q, hasMinRole]);

  const close = () => { onOpenChange(false); setQ(''); setSel(0); };
  const go = (path: string) => { close(); navigate(path); };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/20" />
        <Dialog.Content
          aria-describedby={undefined}
          className="erp fixed left-1/2 top-[12vh] z-50 w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-srf bg-surface shadow-[0_16px_48px_-12px_rgba(0,0,0,.25),0_0_0_1px_hsl(var(--line))]"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); go(rows[sel].path); }
          }}
        >
          <Dialog.Title className="sr-only">Ir a un módulo</Dialog.Title>
          <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
            <Search className="size-4 text-ink-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0); }}
              placeholder="Ir a un módulo"
              aria-label="Ir a un módulo"
              className="h-full flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted/70"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5" role="listbox" aria-label="Módulos">
            {rows.length === 0 && <div className="px-3 py-6 text-center text-table text-ink-muted">Nada con “{q}”</div>}
            {rows.map((r, idx) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.path}
                  role="option"
                  aria-selected={idx === sel}
                  ref={idx === sel ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                  onMouseEnter={() => setSel(idx)}
                  onClick={() => go(r.path)}
                  className={cn('flex h-9 cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 text-table text-ink', idx === sel && 'bg-ink/[0.05]')}
                >
                  <Icon className="size-4 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="text-meta text-ink-muted">{r.group}</span>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
