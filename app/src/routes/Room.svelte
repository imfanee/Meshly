<script lang="ts">
  /**
   * Room route container: renders the right phase screen. The fragment
   * (#secret.thumb) is validated here because the room secret never leaves
   * the URL; it is parsed but never rendered or logged.
   */
  import { t } from '../lib/i18n/en-GB';
  import { session } from '../lib/stores/session.svelte';
  import { isIncompleteLink, parseLink } from '../lib/core/room/link';
  import { navigate } from '../lib/router.svelte';
  import PreJoin from './PreJoin.svelte';
  import Lobby from './Lobby.svelte';
  import Call from './Call.svelte';
  import PostCall from './PostCall.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Footer from '../lib/ui/Footer.svelte';

  let { roomId }: { roomId: string } = $props();

  const supported =
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  // Re-parse the link whenever the room route mounts.
  $effect(() => {
    const parsed = parseLink(window.location.pathname + window.location.hash);
    if (parsed && parsed.roomId === roomId) {
      session.room = parsed;
      session.link ??= window.location.href;
    }
  });

  const incomplete = isIncompleteLink(
    window.location.pathname,
    window.location.hash,
  );
</script>

{#if !supported}
  <div
    class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
  >
    <h1 class="text-xl font-semibold">{t.errors.unsupportedBrowser}</h1>
    <Footer />
  </div>
{:else if incomplete}
  <div
    class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
  >
    <h1 class="text-xl font-semibold">{t.errors.incompleteLink}</h1>
    <Button variant="secondary" onclick={() => navigate('/')}>
      {t.errors.backHome}
    </Button>
    <Footer />
  </div>
{:else if session.phase === 'prejoin'}
  <PreJoin />
{:else if session.phase === 'lobby'}
  <Lobby />
{:else if session.phase === 'call'}
  <Call />
{:else}
  <PostCall />
{/if}
