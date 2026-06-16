import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll position to the top of the page on every route change.
 * Mount this once near the root of the app (inside the Router). Without it,
 * React Router preserves scroll, which is jarring when clicking on a product
 * card from far down the listing — the user lands on the detail page already
 * scrolled to the footer.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Disable smooth scroll for the jump itself so it lands instantly at top
    // (smooth would animate from the deep position the user clicked from).
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    html.style.scrollBehavior = previous;
  }, [pathname]);
  return null;
}
