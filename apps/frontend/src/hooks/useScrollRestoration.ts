import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// El scroll de la app vive dentro de un <main overflow-y-auto> (no en el
// <body>/window), así que la restauración nativa del navegador al usar
// "atrás" no aplica acá — hay que guardarla y reponerla a mano.
//
// Se guarda por `location.key` (react-router reusa el MISMO key cuando
// volvés a una entrada del historial con atrás/adelante, y genera uno nuevo
// en cada navegación hacia adelante) — así cada pantalla recuerda su propio
// scroll sin pisar el de otras.
//
// El contenido de la página siguiente suele cargar de forma asíncrona
// (React Query) y arranca más bajo que su alto final, así que fijar
// scrollTop una sola vez al montar no alcanza: se reintenta en cada frame
// hasta que "pega" (la lista ya creció lo suficiente) o se agotan los
// intentos, sin bloquear si el contenido nunca llega a esa altura (ej. la
// lista quedó con menos filas).
export function useScrollRestoration(ref: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const positions = useRef<Map<string, number>>(new Map());
  const currentKey = useRef(location.key);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => { positions.current.set(currentKey.current, el.scrollTop); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    currentKey.current = location.key;
    const el = ref.current;
    if (!el) return;
    const target = positions.current.get(location.key) ?? 0;

    let attempts = 0;
    let raf = 0;
    const tryRestore = () => {
      if (!el) return;
      el.scrollTop = target;
      attempts += 1;
      if (Math.abs(el.scrollTop - target) > 2 && attempts < 30) {
        raf = requestAnimationFrame(tryRestore);
      }
    };
    tryRestore();
    return () => cancelAnimationFrame(raf);
  }, [location.key, ref]);
}
