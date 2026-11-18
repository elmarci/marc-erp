import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, Moon, Sun, Bell, Menu, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Kbd } from '@/components/erp';
import { findNav } from './nav';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/services/api';
import { getInitials, ROLE_LABELS } from '@/lib/utils';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { MARK_LABELS, useMyAttendance } from '@/modules/attendance/attendance';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header({ onMenuClick, onSearchClick }: { onMenuClick?: () => void; onSearchClick?: () => void }) {
  const { user, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  // Atajo de marcación para quien tiene horario asignado (vendedoras, etc.):
  // lleva a Asistencia, donde confirma y ve sus marcas del día.
  const { data: attendance } = useMyAttendance(!!user);
  const pendingMark = attendance?.schedule ? attendance.nextAction : null;
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.classList.contains('dark'),
  );

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Logout silencioso si falla
    } finally {
      logout();
      navigate('/login');
      toast.success('Sesión cerrada correctamente.');
    }
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setDarkMode((v) => !v);
  };

  const { group, item } = findNav(location.pathname);
  const crumbs = [group?.label, item?.label].filter(Boolean) as string[];
  const iconBtn = 'tap grid size-8 shrink-0 place-items-center rounded-ctl text-ink-muted hover:bg-ink/[0.06] hover:text-ink';

  return (
    <header className="erp sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:px-6">
      {/* Botón del menú: solo en celular/tablet */}
      <button type="button" className={cn(iconBtn, '-ml-1 lg:hidden')} onClick={onMenuClick} aria-label="Menú">
        <Menu className="size-4" />
      </button>
      <nav aria-label="Ruta" className="hidden min-w-0 items-center gap-1.5 text-table sm:flex">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-ink-muted/50">/</span>}
            <span className={cn('truncate', i === crumbs.length - 1 ? 'font-medium text-ink' : 'text-ink-muted')}>{c}</span>
          </span>
        ))}
      </nav>

      <button
        type="button"
        onClick={onSearchClick}
        className="tap ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-ctl bg-ink/[0.04] px-2.5 text-table text-ink-muted hover:bg-ink/[0.07] sm:w-[240px] sm:flex-none"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Buscar</span>
        <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {pendingMark && (
          <Btn size="sm" variant={pendingMark === 'CHECK_IN' ? 'primary' : 'secondary'} onClick={() => navigate('/attendance')}>
            <Clock />
            <span className="hidden sm:inline">{MARK_LABELS[pendingMark]}</span>
          </Btn>
        )}
        {/* Avisos del día */}
        <NoticesBell enabled={!!user} btnCls={iconBtn} />

        {/* Modo oscuro */}
        <button type="button" className={iconBtn} onClick={toggleDarkMode} aria-label="Cambiar tema">
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        {/* Usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="tap flex h-8 items-center gap-2 rounded-ctl pl-1 pr-1 hover:bg-ink/[0.06] sm:pr-2" aria-label="Mi cuenta">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink/[0.08] text-[11px] font-semibold text-ink">
                {user ? getInitials(user.firstName, user.lastName) : '?'}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-table font-medium text-ink">{user?.firstName} {user?.lastName}</span>
                <span className="block text-[11px] text-ink-muted">{user?.role ? ROLE_LABELS[user.role] ?? user.role : ''}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <User className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

interface Notice { key: string; tone: 'danger' | 'warning' | 'info'; title: string; detail: string; link: string }

const TONE_DOT: Record<Notice['tone'], string> = {
  danger: 'bg-bad', warning: 'bg-warn', info: 'bg-ink-muted/50',
};

// Lo que hay que mirar hoy: vencidos, por vencer, stock bajo y (supervisores)
// pagos atrasados. Se refresca cada 5 minutos.
function NoticesBell({ enabled, btnCls }: { enabled: boolean; btnCls: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['inv-notices'],
    queryFn: async () => (await api.get<{ data: { notices: Notice[]; count: number } }>('/inventory/notices')).data.data,
    enabled,
    refetchInterval: 5 * 60_000,
  });
  const notices = data?.notices ?? [];
  const urgent = notices.filter((n) => n.tone !== 'info').length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Avisos${notices.length ? ` (${notices.length})` : ''}`} className={cn(btnCls, 'relative')}>
          <Bell className="size-4" />
          {notices.length > 0 && (
            <span className={cn('absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-surface',
              urgent ? 'bg-bad' : 'bg-ink-muted')}>
              {notices.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <DropdownMenuLabel className="px-4 py-3">Avisos de hoy</DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {notices.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Todo en orden por ahora.</p>
        ) : notices.map((n) => (
          <DropdownMenuItem key={n.key} onClick={() => navigate(n.link)} className="flex cursor-pointer items-start gap-3 rounded-none px-4 py-3">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[n.tone])} />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug">{n.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{n.detail}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
