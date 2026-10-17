<script lang="ts">
  /**
   * Call screen shell, doc 05 section 4.4. Always dark regardless of theme.
   * The peer tiles, real media and data channels arrive in T1.6 to T1.8; this
   * implements the complete chrome: auto-hiding top bar, stage, control bar
   * (desktop order and mobile + More sheet), side panel and announcements.
   */
  import { t } from '../lib/i18n/en-GB';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';
  import Tabs from '../lib/ui/Tabs.svelte';
  import Tooltip from '../lib/ui/Tooltip.svelte';
  import {
    session,
    leaveCall,
    endCall,
    hostActions,
    mediaActions,
    peerStreamOf,
  } from '../lib/stores/session.svelte';
  import { localMedia } from '../lib/core/media/localMedia';
  import { activeSpeaker } from '../lib/core/media/activeSpeaker';
  import Tile from '../lib/ui/Tile.svelte';
  import { settings } from '../lib/stores/settings.svelte';
  import { ui, togglePanel, toast } from '../lib/stores/ui.svelte';
  import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    MonitorUp,
    Hand,
    SmilePlus,
    MessageSquare,
    Users,
    NotebookPen,
    MoreHorizontal,
    PhoneOff,
    Link2,
    Circle,
    Lock,
    LayoutGrid,
    RectangleHorizontal,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';

  const isHost = $derived(session.role === 'host');
  let elapsed = $state(0);
  let topVisible = $state(true);
  let handUp = $state(false);
  let moreOpen = $state(false);
  let leaveMenu = $state(false);
  let copied = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Grid on desktop, speaker on mobile (doc 05). */
  let layout = $state<'grid' | 'speaker'>(
    window.innerWidth < 640 ? 'speaker' : 'grid',
  );
  let pinned = $state<string | null>(null);
  let soundBlocked = $state(false);
  let speakingMuted = $state(false);
  let activeId = $state<string | null>(null);

  const tileCount = $derived(session.peers.length + 1);
  const gridCols = $derived(
    tileCount <= 1 ? 1 : tileCount === 2 ? 2 : tileCount <= 4 ? 2 : 3,
  );

  $effect(() =>
    activeSpeaker.subscribe(() => {
      activeId = activeSpeaker.active;
      speakingMuted = !settings.micOn && activeSpeaker.micLevel > 0.03;
    }),
  );

  const timer = $derived(
    `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(
      elapsed % 60,
    ).padStart(2, '0')}`,
  );

  onMount(() => {
    const tick = setInterval(() => (elapsed += 1), 1_000);
    const poke = () => {
      topVisible = true;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (topVisible = false), 3_000);
    };
    window.addEventListener('pointermove', poke);
    poke();
    return () => {
      clearInterval(tick);
      window.removeEventListener('pointermove', poke);
      if (hideTimer) clearTimeout(hideTimer);
    };
  });

  async function copyLink() {
    if (!session.link) return;
    try {
      await navigator.clipboard.writeText(session.link);
      copied = true;
      setTimeout(() => (copied = false), 2_000);
    } catch {
      toast(t.errors.retry);
    }
  }

  function leave(ended: boolean) {
    leaveMenu = false;
    if (ended) void endCall();
    else void leaveCall();
  }

  let localStream = $state<MediaStream | null>(null);
  onMount(() =>
    localMedia.onChange(() => (localStream = localMedia.snapshot().stream)),
  );
  onMount(() => (localStream = localMedia.snapshot().stream));

  // Unmuted remote videos can be paused by autoplay policy; offer a tap fix.
  $effect(() => {
    void session.peers.length;
    const id = setTimeout(() => {
      soundBlocked = [
        ...document.querySelectorAll<HTMLVideoElement>('video:not([muted])'),
      ].some((v) => v.paused);
    }, 800);
    return () => clearTimeout(id);
  });

  // Toast on new knocks so the host notices without the panel open.
  let seenKnocks = $state(0);
  $effect(() => {
    if (session.knocks.length > seenKnocks) {
      const newest = session.knocks[session.knocks.length - 1];
      toast(t.people.knockToast(newest.name));
    }
    seenKnocks = session.knocks.length;
  });
</script>

<svelte:head>
  <title>{t.appName}</title>
</svelte:head>

<div
  data-theme="dark"
  class="flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]"
>
  <!-- Top bar: auto-hides on desktop after 3 s idle; pinned on mobile. -->
  <header
    class="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 py-3
      transition-opacity duration-200 {topVisible
      ? 'opacity-100'
      : 'pointer-events-none opacity-0'} sm:opacity-100"
    style="background: linear-gradient(to bottom, rgb(11 17 23 / 0.9), transparent)"
  >
    <span class="text-sm tabular-nums" aria-label="Meeting duration"
      >{timer}</span
    >
    <span class="text-sm text-text-muted">
      {session.peerCount}
      {session.peerCount === 1 ? 'person' : 'people'}
    </span>
    <span class="flex-1"></span>
    <Tooltip text={t.call.copyLink}>
      <button
        class="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2
          px-3 text-sm hover:bg-border focus-visible:outline-2
          focus-visible:outline-brand"
        onclick={copyLink}
      >
        <Link2 size={16} />
        {copied ? t.prejoin.copied : t.call.copyLink}
      </button>
    </Tooltip>
  </header>

  <!-- Stage: grid or speaker layout (doc 05 4.4) -->
  <main class="relative flex-1 overflow-hidden p-2">
    {#if layout === 'speaker' && session.peers.length > 0}
      {@const large =
        session.peers.find((p) => p.peerId === (pinned ?? activeId)) ??
        session.peers[0]}
      {@const strip = session.peers.filter((p) => p !== large)}
      <div class="flex h-full flex-col gap-2">
        <div class="min-h-0 flex-1">
          <Tile
            peerId={large.peerId}
            name={large.name}
            stream={peerStreamOf(large.peerId)}
            camOn={large.camOn && large.hasVideo}
            micOn={large.micOn}
            link={large.link}
            quality={large.quality}
            large
            canModerate={isHost}
            onRemove={() => hostActions.kick(large.peerId)}
          />
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <div class="w-36 shrink-0">
            <Tile
              peerId={session.peerId ?? 'me'}
              name={settings.displayName || t.call.you}
              stream={localStream}
              camOn={settings.camOn && !!localStream?.getVideoTracks().length}
              micOn={settings.micOn}
              self
            />
          </div>
          {#each strip as p (p.peerId)}
            <div class="w-36 shrink-0">
              <Tile
                peerId={p.peerId}
                name={p.name}
                stream={peerStreamOf(p.peerId)}
                camOn={p.camOn && p.hasVideo}
                micOn={p.micOn}
                link={p.link}
                quality={p.quality}
                canModerate={isHost}
                onRemove={() => hostActions.kick(p.peerId)}
              />
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div
        class="grid h-full gap-2"
        style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr));
          align-content: center"
      >
        <Tile
          peerId={session.peerId ?? 'me'}
          name={settings.displayName || t.call.you}
          stream={localStream}
          camOn={settings.camOn && !!localStream?.getVideoTracks().length}
          micOn={settings.micOn}
          self
        />
        {#each session.peers as p (p.peerId)}
          <Tile
            peerId={p.peerId}
            name={p.name}
            stream={peerStreamOf(p.peerId)}
            camOn={p.camOn && p.hasVideo}
            micOn={p.micOn}
            link={p.link}
            quality={p.quality}
            canModerate={isHost}
            onRemove={() => hostActions.kick(p.peerId)}
          />
        {/each}
      </div>
    {/if}
    {#if soundBlocked}
      <button
        class="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full
          bg-brand px-4 py-2 text-sm font-medium text-[#04211d] shadow-lg"
        onclick={() => {
          document
            .querySelectorAll<HTMLVideoElement>('video:not([muted])')
            .forEach((v) => void v.play().catch(() => undefined));
          soundBlocked = false;
        }}>{t.call.sound}</button
      >
    {/if}
  </main>

  <!-- Side panel: 360px column on desktop, full-screen overlay on mobile. -->
  {#if ui.panel}
    <aside
      class="absolute inset-0 z-30 flex flex-col bg-surface p-4 md:inset-y-0
        md:left-auto md:right-0 md:w-[360px] md:border-l md:border-border"
    >
      <div class="mb-3 flex items-center justify-between">
        <div class="flex-1">
          <Tabs
            active={ui.panel ?? 'chat'}
            label="Meeting panel"
            items={[
              { id: 'chat', label: t.call.chat },
              { id: 'people', label: t.call.people },
              { id: 'notes', label: t.call.notes },
            ]}
            onchange={(id) => (ui.panel = id as typeof ui.panel)}
          />
        </div>
        <button
          class="ml-3 rounded-lg px-2 py-1 text-text-muted hover:bg-surface-2
            focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Close panel"
          onclick={() => (ui.panel = null)}>&times;</button
        >
      </div>
      <div class="flex-1 overflow-y-auto text-sm">
        {#if ui.panel === 'chat'}
          <p class="text-text-muted">Chat arrives in T1.8.</p>
        {/if}
        {#if ui.panel === 'people'}
          {#if isHost && session.knocks.length > 0}
            <h3
              class="mb-1 text-xs font-semibold uppercase tracking-wide
              text-text-muted"
            >
              {t.people.knocking}
            </h3>
            <ul class="mb-4 space-y-1" aria-label={t.people.knocking}>
              {#each session.knocks as k (k.peerId)}
                <li
                  class="flex items-center gap-2 rounded-lg border
                    border-border bg-surface-2 px-3 py-2"
                >
                  <span class="flex-1 truncate">{k.name}</span>
                  <button
                    class="rounded-md bg-brand px-2.5 py-1 text-xs font-medium
                      text-[#04211d] hover:opacity-90
                      focus-visible:outline-2 focus-visible:outline-white"
                    onclick={() => hostActions.admit(k.peerId)}
                    >{t.people.admit}</button
                  >
                  <button
                    class="rounded-md bg-border px-2.5 py-1 text-xs font-medium
                      hover:opacity-90 focus-visible:outline-2
                      focus-visible:outline-white"
                    onclick={() => hostActions.deny(k.peerId)}
                    >{t.people.deny}</button
                  >
                </li>
              {/each}
            </ul>
          {/if}
          <h3
            class="mb-1 text-xs font-semibold uppercase tracking-wide
            text-text-muted"
          >
            {t.people.participants}
          </h3>
          <ul class="space-y-1" aria-label={t.people.participants}>
            {#each session.roster as r (r.peerId)}
              <li class="flex items-center gap-2 rounded-lg px-3 py-2">
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full
                    bg-surface-2 text-xs font-semibold"
                  >{r.name.slice(0, 1).toUpperCase()}</span
                >
                <span class="flex-1 truncate">{r.name}</span>
                {#if r.role === 'host'}
                  <span class="text-xs text-text-muted">host</span>
                {:else if isHost}
                  <button
                    class="rounded-md px-2 py-1 text-xs text-danger
                      hover:bg-surface-2 focus-visible:outline-2
                      focus-visible:outline-white"
                    onclick={() => hostActions.kick(r.peerId)}
                    >{t.people.remove}</button
                  >
                {/if}
              </li>
            {/each}
          </ul>
          {#if isHost}
            <button
              class="mt-4 flex w-full items-center gap-2 rounded-lg border
                border-border px-3 py-2 text-left hover:bg-surface-2
                focus-visible:outline-2 focus-visible:outline-brand"
              aria-pressed={session.locked}
              onclick={() => hostActions.setLocked(!session.locked)}
            >
              <Lock size={16} />
              {t.call.lockMeeting}
              {#if session.locked}
                <span class="ml-auto text-xs text-brand">on</span>
              {/if}
            </button>
          {/if}
        {/if}
        {#if ui.panel === 'notes'}
          <p class="text-text-muted">{t.call.aiNotes}</p>
        {/if}
      </div>
    </aside>
  {/if}

  <!-- Control bar -->
  <nav
    class="relative z-20 flex items-center justify-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3"
    aria-label="Call controls"
  >
    {#if speakingMuted}
      <span
        class="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full
          bg-danger px-3 py-1 text-xs font-medium text-white"
        >{t.call.mutedHint}</span
      >
    {/if}
    <IconButton
      label={settings.micOn ? t.prejoin.micOn : t.prejoin.micOff}
      pressed={settings.micOn}
      onclick={() => void mediaActions.setMic(!settings.micOn)}
    >
      {#if settings.micOn}<Mic size={22} />{:else}<MicOff size={22} />{/if}
    </IconButton>
    <IconButton
      label={settings.camOn ? t.prejoin.cameraOn : t.prejoin.cameraOff}
      pressed={settings.camOn}
      onclick={() => void mediaActions.setCam(!settings.camOn)}
    >
      {#if settings.camOn}<Video size={22} />{:else}<VideoOff size={22} />{/if}
    </IconButton>
    <span class="hidden sm:contents">
      <IconButton
        label={t.call.shareScreen}
        onclick={() => toast(t.call.shareScreen)}
      >
        <MonitorUp size={22} />
      </IconButton>
      <IconButton
        label={handUp ? t.call.lowerHand : t.call.raiseHand}
        pressed={handUp}
        onclick={() => (handUp = !handUp)}
      >
        <Hand size={22} />
      </IconButton>
      <IconButton
        label={t.call.reactions}
        onclick={() => toast(t.call.reactions)}
      >
        <SmilePlus size={22} />
      </IconButton>
      <IconButton
        label={t.call.people}
        class="relative"
        onclick={() => togglePanel('people')}
      >
        <Users size={22} />
        {#if session.knocks.length > 0}
          <span
            class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center
              justify-center rounded-full bg-brand px-1 text-xs font-semibold
              text-[#04211d]">{session.knocks.length}</span
          >
        {/if}
      </IconButton>
      <IconButton label={t.call.notes} onclick={() => togglePanel('notes')}>
        <NotebookPen size={22} />
      </IconButton>
      <IconButton
        label={layout === 'grid' ? t.call.speakerLayout : t.call.gridLayout}
        onclick={() => (layout = layout === 'grid' ? 'speaker' : 'grid')}
      >
        {#if layout === 'grid'}<RectangleHorizontal
            size={22}
          />{:else}<LayoutGrid size={22} />{/if}
      </IconButton>
    </span>
    <span class="relative">
      <IconButton
        label={t.call.chat}
        pressed={ui.panel === 'chat'}
        onclick={() => togglePanel('chat')}
        class="relative"
      >
        <MessageSquare size={22} />
      </IconButton>
      {#if ui.unreadChat > 0}
        <span
          class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center
            justify-center rounded-full bg-danger px-1 text-xs font-semibold
            text-white">{ui.unreadChat}</span
        >
      {/if}
    </span>
    <IconButton
      label={t.call.more}
      pressed={moreOpen}
      onclick={() => (moreOpen = true)}
      class="sm:hidden"
    >
      <MoreHorizontal size={22} />
    </IconButton>

    <span class="relative">
      <button
        class="inline-flex h-12 items-center gap-2 rounded-full bg-danger px-5
          font-medium text-white hover:opacity-90 focus-visible:outline-2
          focus-visible:outline-offset-2 focus-visible:outline-brand"
        onclick={() => (isHost ? (leaveMenu = !leaveMenu) : leave(false))}
        aria-label={t.call.leave}
      >
        <PhoneOff size={20} />
        <span class="hidden sm:inline">{t.call.leave}</span>
      </button>
      {#if leaveMenu && isHost}
        <div
          class="absolute bottom-full right-0 mb-2 w-56 rounded-xl border
            border-border bg-surface p-1 text-sm shadow-xl"
          role="menu"
        >
          <button
            role="menuitem"
            class="w-full rounded-lg px-3 py-2.5 text-left hover:bg-surface-2"
            onclick={() => leave(false)}>{t.call.leave}</button
          >
          <button
            role="menuitem"
            class="w-full rounded-lg px-3 py-2.5 text-left text-danger
              hover:bg-surface-2"
            onclick={() => leave(true)}>{t.call.endForAll}</button
          >
        </div>
      {/if}
    </span>
  </nav>
</div>

<!-- Mobile "More" sheet -->
<Sheet bind:open={moreOpen} title={t.call.more}>
  <div class="grid gap-1 text-sm">
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        handUp = !handUp;
        moreOpen = false;
      }}
    >
      <Hand size={20} />
      {handUp ? t.call.lowerHand : t.call.raiseHand}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        togglePanel('people');
        moreOpen = false;
      }}
    >
      <Users size={20} />
      {t.call.people}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        togglePanel('notes');
        moreOpen = false;
      }}
    >
      <NotebookPen size={20} />
      {t.call.notes}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        void mediaActions.flipCamera();
        moreOpen = false;
      }}
    >
      <Video size={20} />
      {t.call.switchCamera}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        layout = layout === 'grid' ? 'speaker' : 'grid';
        moreOpen = false;
      }}
    >
      <LayoutGrid size={20} />
      {layout === 'grid' ? t.call.speakerLayout : t.call.gridLayout}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={copyLink}
    >
      <Link2 size={20} />
      {t.call.copyLink}
    </button>
    {#if isHost}
      <button
        class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
          hover:bg-surface-2"
        onclick={() => toast(t.call.record)}
      >
        <Circle size={20} />
        {t.call.record}
      </button>
      <button
        class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
          hover:bg-surface-2"
        onclick={() => toast(t.call.lockMeeting)}
      >
        <Lock size={20} />
        {t.call.lockMeeting}
      </button>
    {/if}
  </div>
</Sheet>

<!-- Announcement region for screen readers (joins, leaves, knocks). -->
<div aria-live="polite" class="sr-only">{session.announce}</div>
