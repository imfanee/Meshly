/**
 * Tiny history router. The Apache .htaccess rewrites every non-file path to
 * index.html, so routes are real URLs: '/', '/r/<roomId>', '/about',
 * '/privacy', '/terms'. The room secret lives only in the URL fragment and is
 * read directly where needed; it never enters route state.
 */

import { SvelteURL } from 'svelte/reactivity';

export type Route =
  | { name: 'home' }
  | { name: 'room'; roomId: string }
  | { name: 'about' }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'notfound'; path: string };

const ROOM_PATH = /^\/r\/([1-9A-HJ-NP-Za-km-z]{10})$/;

export function parsePath(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  const room = ROOM_PATH.exec(pathname);
  if (room) return { name: 'room', roomId: room[1] };
  if (pathname === '/about') return { name: 'about' };
  if (pathname === '/privacy') return { name: 'privacy' };
  if (pathname === '/terms') return { name: 'terms' };
  return { name: 'notfound', path: pathname };
}

export const router = $state({
  route:
    typeof window === 'undefined'
      ? ({ name: 'home' } as Route)
      : parsePath(window.location.pathname),
});

export function navigate(to: string, replace = false): void {
  if (typeof window === 'undefined') return;
  const url = new SvelteURL(to, window.location.origin);
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  router.route = parsePath(url.pathname);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    router.route = parsePath(window.location.pathname);
  });
}
