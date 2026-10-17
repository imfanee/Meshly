<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import Button from '../lib/ui/Button.svelte';
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
  import {
    session,
    resetSession,
    enterRoom,
  } from '../lib/stores/session.svelte';
  import { navigate } from '../lib/router.svelte';
  import { createRoom } from '../lib/core/room/room';
  import { saveHostKey } from '../lib/core/room/hostKeyStore';
  import { config } from '../config';

  const heading = $derived(
    session.endReason === 'ended'
      ? t.postcall.ended
      : session.endReason === 'removed'
        ? t.postcall.removed
        : t.postcall.left,
  );

  const minutes = $derived(
    session.joinedAt ? Math.floor((Date.now() - session.joinedAt) / 60_000) : 0,
  );

  function rejoin() {
    if (!session.room || !session.link) return;
    enterRoom(session.room, session.link, 'guest');
    session.phase = 'prejoin';
  }

  async function newMeeting() {
    const room = await createRoom(config.appUrl);
    await saveHostKey(room.link.roomId, room.host);
    enterRoom(room.link, room.url, 'host');
    navigate(
      `/r/${room.link.roomId}#${room.link.roomSecret}.${room.link.hostThumb}`,
    );
  }

  function home() {
    resetSession();
    navigate('/');
  }
</script>

<svelte:head>
  <title>{t.appName} · {heading}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
  <main
    class="flex flex-1 flex-col items-center justify-center gap-6 text-center"
  >
    <MeshLogo size={64} />
    <div>
      <h1 class="text-2xl font-semibold">{heading}</h1>
      {#if session.joinedAt}
        <p class="mt-2 text-sm text-text-muted">
          {t.postcall.duration(minutes)}
        </p>
      {/if}
    </div>
    <div class="flex w-full flex-col gap-2">
      {#if session.room}
        <Button variant="secondary" onclick={rejoin}>
          {t.postcall.rejoin}
        </Button>
      {/if}
      <Button variant="primary" onclick={newMeeting}>
        {t.postcall.newMeeting}
      </Button>
      <Button variant="ghost" onclick={home}>{t.postcall.home}</Button>
    </div>
  </main>
  <Footer />
</div>
