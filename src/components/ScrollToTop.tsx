import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll position to the top of the page on every route change.
 * Mount this once near the root of the app (inside the Router). Without it,
 * React Router preserves scroll, which is jarring when clicking on a product
 * card from far down the listing — the user lands on the detail page already
 * scrolled to the footer.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    const pathChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (!pathChanged) return; // solo cambió el #ancla: el navegador ya hace el salto
    // Disable smooth scroll for the jump itself so it lands instantly at top
    // (smooth would animate from the deep position the user clicked from).
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    html.style.scrollBehavior = previous;
    // Enlaces con ancla (p. ej. «/#bundle» desde la ficha): se baja a la sección
    // cuando ya se pintó (la portada carga el catálogo después).
    if (!hash || hash.length < 2) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 20) {
        window.clearInterval(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [pathname, hash]);
  return null;
}
