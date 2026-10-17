/**
 * Theme handling, doc 05 section 2: light or dark everywhere except the call
 * view which is always dark. `data-theme` on <html> drives the CSS custom
 * properties in app.css; 'system' tracks prefers-color-scheme.
 */

import { settings, type Theme } from '../stores/settings.svelte';

let media: MediaQueryList | null = null;
let onMedia: (() => void) | null = null;

function resolved(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return media?.matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  media ??= window.matchMedia('(prefers-color-scheme: dark)');
  const value = resolved(theme);
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
    if (!onMedia) {
      onMedia = () => applyTheme(settings.theme);
      media.addEventListener('change', onMedia);
    }
  } else {
    root.dataset.theme = value;
  }
}

export function initTheme(): void {
  applyTheme(settings.theme);
}
