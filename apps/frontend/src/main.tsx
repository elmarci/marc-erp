import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { usePosStore } from './stores/posStore';
import './index.css';

// Deja la app instalada para que siga cargando sin internet (solo activo en
// el build de producción — devOptions.enabled=false en vite.config.ts).
// autoUpdate activa la versión nueva sola, pero el navegador solo revisa si
// hay una nueva versión al registrar el service worker (o sea, en la carga
// de página) — una pestaña dejada abierta todo el día nunca se enteraba de
// un deploy nuevo. Forzamos una revisión cada minuto para que el cambio
// llegue solo, sin que el cajero tenga que cerrar y volver a abrir la app.
//
// Ojo: activar el service worker nuevo (skipWaiting/clientsClaim, dentro del
// propio sw.js generado) NO recarga la pestaña ya abierta — el código de
// React en memoria sigue siendo el viejo hasta que algo la recargue. Una
// caja dejada abierta días enteras podía quedarse corriendo JS desactualizado
// indefinidamente (así fue como a un cajero le siguió fallando "Venta
// excepcional" con un bug ya arreglado en el servidor). Por eso escuchamos
// "controllerchange" y recargamos apenas el carrito esté vacío — nunca a
// media venta, para no perder lo que ya escaneó.
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    const reloadWhenCartEmpty = () => {
      if (usePosStore.getState().items.length === 0) window.location.reload();
      else setTimeout(reloadWhenCartEmpty, 5000);
    };
    reloadWhenCartEmpty();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => registration.update(), 60 * 1000);
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,         // 30 segundos — datos frescos
      refetchOnWindowFocus: true,   // refresca al volver a la pestaña
      refetchOnReconnect: true,     // refresca al reconectarse
      retry: (failureCount, error) => {
        if ((error as { response?: { status?: number } })?.response?.status === 401) return false;
        if ((error as { response?: { status?: number } })?.response?.status === 403) return false;
        if ((error as { response?: { status?: number } })?.response?.status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
