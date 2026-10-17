<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import Button from '../lib/ui/Button.svelte';
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
  import { session, resetSession } from '../lib/stores/session.svelte';
  import { navigate } from '../lib/router.svelte';

  const statusText = $derived(
    {
      waiting: t.lobby.waiting,
      'host-away': t.lobby.hostAway,
      denied: t.lobby.denied,
      full: t.lobby.full,
      locked: t.lobby.locked,
    }[session.lobbyState],
  );

  function cancel() {
    resetSession();
    navigate('/');
  }
</script>

<svelte:head>
  <title>{t.appName} · {t.lobby.waiting}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
  <main
    class="flex flex-1 flex-col items-center justify-center gap-6 text-center"
  >
    <MeshLogo size={72} animate />
    <div
      class="w-full rounded-xl border border-border bg-surface p-6"
      role="status"
    >
      <p class="font-medium">{statusText}</p>
      <div class="mt-4 flex justify-center">
        <Button variant="secondary" onclick={cancel}>
          {t.lobby.cancel}
        </Button>
      </div>
    </div>
  </main>
  <Footer />
</div>
