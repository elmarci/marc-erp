import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Deja la app instalada para que siga cargando sin internet (solo activo en
// el build de producción — devOptions.enabled=false en vite.config.ts).
// autoUpdate activa la versión nueva sola, pero el navegador solo revisa si
// hay una nueva versión al registrar el service worker (o sea, en la carga
// de página) — una pestaña dejada abierta todo el día nunca se enteraba de
// un deploy nuevo. Forzamos una revisión cada minuto para que el cambio
// llegue solo, sin que el cajero tenga que cerrar y volver a abrir la app.
if ('serviceWorker' in navigator) {
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
