import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const location = useLocation();
  useRealtimeSync();

  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Cerrar al cambiar de ruta en móvil
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isPos = location.pathname === '/pos';
  if (isPos) return <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Overlay oscuro en móvil/tablet */}
      {isTablet && mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 transition-transform duration-200',
        // En tablet: fuera de pantalla cuando cerrado, visible cuando abierto
        isTablet
          ? mobileOpen ? 'translate-x-0' : '-translate-x-full'
          // En desktop: siempre visible, ancho según estado collapsed
          : 'translate-x-0',
      )}>
        <Sidebar
          collapsed={isTablet ? false : sidebarCollapsed}
          onToggle={() => {
            if (isTablet) setMobileOpen(false);
            else setSidebarCollapsed(v => !v);
          }}
        />
      </aside>

      {/* Contenido principal */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden transition-all duration-200',
        // En desktop: margen según sidebar
        !isTablet && (sidebarCollapsed ? 'ml-16' : 'ml-64'),
        // En tablet: siempre ancho completo
        isTablet && 'ml-0',
      )}>
        <Header onMenuClick={() => setMobileOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
