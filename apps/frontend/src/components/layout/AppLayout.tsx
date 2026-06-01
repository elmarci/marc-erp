import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useRealtimeSync();

  // Cerrar sidebar móvil al cambiar de ruta
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isPos = location.pathname === '/pos';
  if (isPos) return <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* Overlay oscuro al abrir sidebar en móvil/tablet */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/*
        Sidebar siempre FIXED.
        - Móvil/tablet: oculto (-translate-x-full) salvo que mobileOpen=true
        - Desktop (lg): siempre visible (lg:translate-x-0 override)
      */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0',   // desktop: siempre visible
      )}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => {
            setSidebarCollapsed(v => !v);
            setMobileOpen(false);
          }}
        />
      </aside>

      {/*
        Contenido.
        - Móvil/tablet: ml-0 (sidebar es overlay, no ocupa espacio)
        - Desktop: ml-16 o ml-64 según estado del sidebar
      */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden transition-all duration-200',
        'ml-0',                              // móvil: ancho completo
        sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64',  // desktop: margen del sidebar
      )}>
        <Header onMenuClick={() => setMobileOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
