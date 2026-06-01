import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  useRealtimeSync();

  // Colapsar sidebar automáticamente en tablet (<1024px)
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Cerrar sidebar móvil al cambiar de ruta
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isPos = location.pathname === '/pos';
  if (isPos) return <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Overlay para móvil cuando el sidebar está abierto */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fijo en desktop, deslizable en móvil/tablet */}
      <div className={cn(
        'fixed inset-y-0 left-0 z-30 transition-transform duration-200 lg:translate-x-0',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <Sidebar
          collapsed={sidebarCollapsed && !mobileSidebarOpen}
          onToggle={() => {
            if (window.innerWidth < 1024) {
              setMobileSidebarOpen(false);
            } else {
              setSidebarCollapsed(v => !v);
            }
          }}
        />
      </div>

      {/* Contenido principal */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden transition-all duration-200',
        // En desktop: margen según estado del sidebar
        sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64',
        // En móvil/tablet: sin margen (sidebar es overlay)
        'ml-0',
      )}>
        <Header onMenuClick={() => setMobileSidebarOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
