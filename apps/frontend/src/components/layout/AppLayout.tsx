import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';
import { cn } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

const COLLAPSED_KEY = 'nav:collapsed';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useRealtimeSync();
  useScrollRestoration(mainRef);

  // Cerrar el menú del celular al cambiar de ruta
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isPos = location.pathname === '/pos';
  if (isPos) return <Outlet />;

  const toggleCollapsed = () => {
    setSidebarCollapsed((v) => {
      try { localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1'); } catch { /* sin espacio */ }
      return !v;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Fondo oscuro al abrir el menú en celular/tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-20 bg-ink/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Celular/tablet: el menú entra encima. Computadora: siempre visible y ocupa su espacio. */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
        mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
      )}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleCollapsed} onClose={() => setMobileOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setMobileOpen((v) => !v)} onSearchClick={() => setSearchOpen(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
