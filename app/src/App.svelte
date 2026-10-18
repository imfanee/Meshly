<script lang="ts">
  import { router } from './lib/router.svelte';
  import { initTheme, applyTheme } from './lib/platform/theme';
  import { settings } from './lib/stores/settings.svelte';
  import { ui } from './lib/stores/ui.svelte';
  import { t } from './lib/i18n/en-GB';
  import Toaster from './lib/ui/Toaster.svelte';
  import Button from './lib/ui/Button.svelte';
  import Home from './routes/Home.svelte';
  import Room from './routes/Room.svelte';
  import About from './routes/About.svelte';
  import Privacy from './routes/Privacy.svelte';
  import Terms from './routes/Terms.svelte';
  import NotFound from './routes/NotFound.svelte';

  import { initInstall } from './lib/platform/install.svelte';
  import MeshLogo from './lib/ui/MeshLogo.svelte';
  import { checkRecordingRecovery } from './lib/stores/session.svelte';
  import { onMount } from 'svelte';

  initTheme();
  initInstall();

  // Installed-window title bar (window-controls-overlay), doc 05 section 6.
  let wco = $state(false);
  onMount(() => {
    // Offer to recover a recording cut short by a crash (doc 06 s.5).
    void checkRecordingRecovery();
    const mq = window.matchMedia('(display-mode: window-controls-overlay)');
    wco = mq.matches;
    const on = () => (wco = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  $effect(() => {
    applyTheme(settings.theme);
  });
</script>

{#if wco}
  <div
    class="fixed left-0 right-0 top-0 z-[60] flex h-8 items-center gap-2 px-3"
    style="-webkit-app-region: drag; padding-left: env(titlebar-area-x, 12px);
      width: env(titlebar-area-width, 100%); background: var(--surface)"
  >
    <MeshLogo size={18} />
    <span class="text-xs font-medium text-text-muted">Meshly</span>
  </div>
{/if}

{#if router.route.name === 'home'}
  <Home />
{:else if router.route.name === 'room'}
  <Room roomId={router.route.roomId} />
{:else if router.route.name === 'about'}
  <About />
{:else if router.route.name === 'privacy'}
  <Privacy />
{:else if router.route.name === 'terms'}
  <Terms />
{:else}
  <NotFound />
{/if}

<Toaster />

{#if ui.updateReady}
  <div
    class="fixed bottom-4 left-4 z-[90] flex items-center gap-3 rounded-xl
      border border-border bg-surface p-4 text-sm shadow-xl"
    role="alert"
  >
    <span>{t.update.ready}</span>
    <Button size="sm" onclick={() => ui.applyUpdate?.()}>
      {t.update.action}
    </Button>
  </div>
{/if}
