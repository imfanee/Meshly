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
// force-reloading mid-call.
ui.applyUpdate = registerSW({
  onNeedRefresh() {
    ui.updateReady = true;
  },
});

export default mount(App, { target });
