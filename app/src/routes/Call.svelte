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
  import { session, leaveRoom } from '../lib/stores/session.svelte';
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
    leaveRoom(ended ? 'ended' : 'left');
  }
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

  <!-- Stage -->
  <main class="relative flex-1 overflow-hidden p-2">
    <div class="grid h-full place-items-center">
      <div
        class="relative aspect-video w-full max-w-3xl overflow-hidden
          rounded-xl border border-border bg-surface"
        aria-label={settings.displayName || t.call.you}
      >
        <div class="flex h-full items-center justify-center text-text-muted">
          {#if settings.camOn}
            <Video size={40} aria-hidden="true" />
          {:else}
            <span
              class="flex h-16 w-16 items-center justify-center rounded-full
                bg-surface-2 text-xl font-semibold"
            >
              {(settings.displayName || 'Y').slice(0, 1).toUpperCase()}
            </span>
          {/if}
        </div>
        <span
          class="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md
            bg-black/60 px-2 py-0.5 text-xs text-white"
        >
          {#if !settings.micOn}<MicOff size={12} />{/if}
          {settings.displayName || t.call.you}
          {t.call.you}
        </span>
      </div>
    </div>
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
      <div class="flex-1 text-sm text-text-muted">
        {#if ui.panel === 'chat'}Chat arrives in T1.8.{/if}
        {#if ui.panel === 'people'}{t.people.participants}{/if}
        {#if ui.panel === 'notes'}{t.call.aiNotes}{/if}
      </div>
    </aside>
  {/if}

  <!-- Control bar -->
  <nav
    class="relative z-20 flex items-center justify-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3"
    aria-label="Call controls"
  >
    <IconButton
      label={settings.micOn ? t.prejoin.micOn : t.prejoin.micOff}
      pressed={settings.micOn}
      onclick={() => (settings.micOn = !settings.micOn)}
    >
      {#if settings.micOn}<Mic size={22} />{:else}<MicOff size={22} />{/if}
    </IconButton>
    <IconButton
      label={settings.camOn ? t.prejoin.cameraOn : t.prejoin.cameraOff}
      pressed={settings.camOn}
      onclick={() => (settings.camOn = !settings.camOn)}
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
      <IconButton label={t.call.people} onclick={() => togglePanel('people')}>
        <Users size={22} />
      </IconButton>
      <IconButton label={t.call.notes} onclick={() => togglePanel('notes')}>
        <NotebookPen size={22} />
      </IconButton>
    </span>
    <span class="relative">
      <IconButton
        label={t.call.chat}
        pressed={ui.panel === 'chat'}
        onclick={() => togglePanel('chat')}
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
      onclick={() => toast(t.call.switchCamera)}
    >
      <Video size={20} />
      {t.call.switchCamera}
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
<div aria-live="polite" class="sr-only"></div>
