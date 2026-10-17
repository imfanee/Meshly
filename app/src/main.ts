import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';
import { ui } from './lib/stores/ui.svelte';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Missing #app element in index.html');
}

// Prompt-style updates (doc 05 section 6): surface a toast instead of
// force-reloading mid-call. Check for updates on launch and hourly.
ui.applyUpdate = registerSW({
  onNeedRefresh() {
    ui.updateReady = true;
  },
  onRegisteredSW(_url, registration) {
    registration?.update();
    setInterval(() => registration?.update(), 60 * 60 * 1000);
  },
});

// E2E harness: expose core modules when ?e2e=1 is present. The dynamic import
// keeps this code-split out of the production entry path.
if (new URLSearchParams(location.search).has('e2e')) {
  void import('./lib/core/signalling/e2e').then((m) => {
    (window as unknown as { __meshlyTest: unknown }).__meshlyTest = m;
  });
}

export default mount(App, { target });
