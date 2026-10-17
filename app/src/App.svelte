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

  initTheme();

  $effect(() => {
    applyTheme(settings.theme);
  });
</script>

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
