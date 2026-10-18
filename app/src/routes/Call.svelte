<script lang="ts">
  /**
   * Call screen shell, doc 05 section 4.4. Always dark regardless of theme.
   * The peer tiles, real media and data channels arrive in T1.6 to T1.8; this
   * implements the complete chrome: auto-hiding top bar, stage, control bar
   * (desktop order and mobile + More sheet), side panel and announcements.
   */
  import { t } from '../lib/i18n/en-GB';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Dialog from '../lib/ui/Dialog.svelte';
  import QrCode from '../lib/ui/QrCode.svelte';
  import Sheet from '../lib/ui/Sheet.svelte';
  import FloatPanel from '../lib/ui/FloatPanel.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import Tabs from '../lib/ui/Tabs.svelte';
  import Tooltip from '../lib/ui/Tooltip.svelte';
  import {
    session,
    leaveCall,
    endCall,
    hostActions,
    mediaActions,
    peerStreamOf,
    screenStreamOf,
    localScreenStream,
    shareScreen,
    stopShare,
    reportWatching,
    startRecording,
    stopRecording,
    recordingActive,
    playRecordChime,
    startNotes,
    stopNotes,
    revokeNotesConsent,
    answerNotesConsent,
    consentedPeerIds,
    updateNotes,
    finalNotes,
    downloadNotes,
    shareNotes,
    sendFile,
    acceptFile,
    declineFile,
    cancelFile,
    saveFile,
    sendChat,
    sendReact,
    setHand,
    REACTION_SET,
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
    QrCode as QrCodeIcon,
    Circle,
    Lock,
    LayoutGrid,
    RectangleHorizontal,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';

  const isHost = $derived(session.role === 'host');
  let elapsed = $state(0);
  let topVisible = $state(true);
  let reactOpen = $state(false);
  let moreOpen = $state(false);

  // Recording notice (doc 06 s.5): banner + chime for every participant,
  // consent dialog for the host before recording starts.
  const recActive = $derived(recordingActive());
  let recConsent = $state(false);
  let recSeen = $state(false);
  $effect(() => {
    if (recActive && !recSeen) {
      recSeen = true;
      playRecordChime();
    }
    if (!recActive) recSeen = false;
  });
  function toggleRecord() {
    if (session.recording) void stopRecording();
    else recConsent = true;
    moreOpen = false;
  }

  // AI notes (doc 06 s.6): consent flow.
  const notesConsentedCount = $derived(consentedPeerIds().length);
  function tryStartNotes() {
    if (settings.aiProvider !== 'local' && !settings.aiKey) {
      toast('Add your AI key in Settings first');
      return;
    }
    startNotes();
  }
  let leaveMenu = $state(false);
  let copied = $state(false);
  let qrOpen = $state(false);
  const isMobile = new MediaQuery('(max-width: 767px)');
  const panelTitle = {
    chat: t.call.chat,
    people: t.call.people,
    notes: t.call.notes,
  };
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

  /** Bind an unproxied MediaStream to a video element. */
  function attachStream(node: HTMLVideoElement, stream: MediaStream | null) {
    node.srcObject = stream;
    return {
      update(s: MediaStream | null) {
        node.srcObject = s;
      },
    };
  }

  // Chat unread badge: count messages while the panel is on another tab.
  let seenChat = $state(0);
  $effect(() => {
    if (ui.panel === 'chat') {
      ui.unreadChat = 0;
      seenChat = session.chat.length;
    } else if (session.chat.length > seenChat) {
      ui.unreadChat += session.chat.length - seenChat;
      seenChat = session.chat.length;
    }
  });

  // Reactions float for a few seconds; a slow ticker prunes the view.
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(id);
  });
  const liveReactions = $derived(
    session.reactions.filter((r) => now - r.ts < 4_000),
  );

  let localScreen = $state<MediaStream | null>(null);
  let remoteScreen = $state<MediaStream | null>(null);
  const sharingPeer = $derived(session.peers.find((p) => p.screen));
  const sharing = $derived(!!sharingPeer || !!localScreen);
  const canShare = $derived(
    typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      window.matchMedia('(pointer: fine)').matches,
  );
  $effect(() => {
    // Re-read whenever peer screen flags or local share state may change.
    void session.peers.map((p) => p.screen).join();
    const id = setInterval(() => {
      localScreen = localScreenStream();
      const s = sharingPeer;
      remoteScreen = s ? screenStreamOf(s.peerId) : null;
    }, 500);
    return () => clearInterval(id);
  });

  let draft = $state('');
  function submitChat(e: Event) {
    e.preventDefault();
    sendChat(draft);
    draft = '';
  }

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
    {#if recActive}
      <span
        class="flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5
          py-1 text-xs font-medium text-danger"
        role="status"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-danger"></span>
        {t.call.recording}
      </span>
    {/if}
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
    <Tooltip text={t.call.shareQr}>
      <button
        class="inline-flex h-9 items-center rounded-full bg-surface-2 px-3
          hover:bg-border focus-visible:outline-2
          focus-visible:outline-brand"
        aria-label={t.call.shareQr}
        onclick={() => (qrOpen = true)}
      >
        <QrCodeIcon size={16} />
      </button>
    </Tooltip>
  </header>

  <!-- Stage: grid or speaker layout (doc 05 4.4) -->
  <main class="relative flex-1 overflow-hidden p-2">
    {#if sharing}
      <!-- Screen layout (doc 05): share large + contain, cameras filmstrip. -->
      <div class="flex h-full flex-col gap-2">
        <div
          class="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black"
        >
          {#if remoteScreen}
            <video
              use:attachStream={remoteScreen}
              autoplay
              playsinline
              class="h-full w-full object-contain"
              data-screen={sharingPeer?.peerId}
            ></video>
            <span
              class="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5
                text-xs text-white">{sharingPeer?.name} is sharing</span
            >
          {:else if localScreen}
            <span
              class="absolute left-2 top-2 z-10 rounded-md bg-amber-500/90
                px-2 py-1 text-xs font-medium text-white"
            >
              You are sharing your screen
            </span>
            <video
              use:attachStream={localScreen}
              autoplay
              playsinline
              muted
              class="absolute bottom-2 right-2 h-28 w-48 rounded-lg
                border-2 border-amber-500 object-cover"
              aria-label="Your screen preview"
            ></video>
          {/if}
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <div class="w-36 shrink-0">
            <Tile
              peerId={session.peerId ?? 'me'}
              name={settings.displayName || t.call.you}
              stream={localStream}
              camOn={settings.camOn && !!localStream?.getVideoTracks().length}
              micOn={settings.micOn}
              hand={session.handUp}
              self
            />
          </div>
          {#each session.peers as p (p.peerId)}
            <div class="w-36 shrink-0">
              <Tile
                peerId={p.peerId}
                name={p.name}
                stream={peerStreamOf(p.peerId)}
                camOn={p.camOn && p.hasVideo}
                micOn={p.micOn}
                hand={p.hand}
                turnDown={p.turnDown}
                link={p.link}
                quality={p.quality}
                canModerate={isHost}
                onRemove={() => hostActions.kick(p.peerId)}
                onVisible={(v) => reportWatching(p.peerId, v)}
              />
            </div>
          {/each}
        </div>
      </div>
    {:else if layout === 'speaker' && session.peers.length > 0}
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
            hand={large.hand}
            turnDown={large.turnDown}
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
              hand={session.handUp}
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
                hand={p.hand}
                turnDown={p.turnDown}
                link={p.link}
                quality={p.quality}
                canModerate={isHost}
                onRemove={() => hostActions.kick(p.peerId)}
                onVisible={(v) => reportWatching(p.peerId, v)}
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
          hand={session.handUp}
          self
        />
        {#each session.peers as p (p.peerId)}
          <Tile
            peerId={p.peerId}
            name={p.name}
            stream={peerStreamOf(p.peerId)}
            camOn={p.camOn && p.hasVideo}
            micOn={p.micOn}
            hand={p.hand}
            turnDown={p.turnDown}
            link={p.link}
            quality={p.quality}
            canModerate={isHost}
            onRemove={() => hostActions.kick(p.peerId)}
            onVisible={(v) => reportWatching(p.peerId, v)}
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
    {#if liveReactions.length > 0}
      <div
        class="pointer-events-none absolute bottom-4 left-4 z-30 flex
          flex-col gap-1"
      >
        {#each liveReactions as r (r.id)}
          <span
            class="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1
              text-sm text-white"
            ><span class="text-lg">{r.emoji}</span>{r.name}</span
          >
        {/each}
      </div>
    {/if}
  </main>

  <!-- Side panel: docked 360px column on desktop; on mobile a floating
       draggable/resizable window so video and controls stay visible. -->
  {#snippet panelBody()}
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
        <div class="flex h-full min-h-0 flex-col">
          <ul
            class="flex-1 space-y-3 overflow-y-auto pr-1"
            aria-label="Chat messages"
          >
            {#each session.files as f (f.id + f.peerId)}
              <li
                class="rounded-lg border border-border px-3 py-2 text-xs"
                data-file={f.id}
              >
                <span class="font-medium">{f.name}</span>
                <span class="text-text-muted">
                  ({Math.ceil(f.size / 1024)} KB, {f.direction === 'in'
                    ? 'from'
                    : 'to'}
                  {session.roster.find((r) => r.peerId === f.peerId)?.name ??
                    'peer'})</span
                >
                {#if f.state === 'streaming'}
                  <span class="ml-1 text-text-muted"
                    >{Math.round((f.progress / f.size) * 100)}%</span
                  >
                  <button
                    class="ml-2 text-danger"
                    onclick={() => void cancelFile(f.id)}>Cancel</button
                  >
                {:else if f.state === 'offered' && f.direction === 'in'}
                  <button
                    class="ml-2 rounded bg-brand px-2 py-0.5 text-[#04211d]"
                    onclick={() => void acceptFile(f.id, f.peerId)}
                    >Accept</button
                  >
                  <button
                    class="ml-1 text-text-muted"
                    onclick={() => void declineFile(f.id, f.peerId)}
                    >Decline</button
                  >
                {:else if f.state === 'offered'}
                  <span class="ml-1 text-text-muted">waiting…</span>
                {:else if f.state === 'done' && f.direction === 'in'}
                  <button
                    class="ml-2 rounded bg-brand px-2 py-0.5 text-[#04211d]"
                    onclick={() => void saveFile(f)}>Save</button
                  >
                {:else if f.state === 'done'}
                  <span class="ml-1 text-text-muted">sent</span>
                {:else if f.state === 'failed'}
                  <span class="ml-1 text-danger">failed</span>
                {/if}
              </li>
            {/each}
            {#each session.chat as m (m.id)}
              <li>
                <div class="flex items-baseline gap-2">
                  <span class="text-xs font-semibold">{m.name}</span>
                  <span class="text-[10px] text-text-muted">
                    {new Date(m.ts).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p
                  class="mt-0.5 whitespace-pre-wrap break-words rounded-lg
                      {m.self ? 'bg-brand/15' : 'bg-surface-2'} px-2.5 py-1.5"
                >
                  {m.text}
                </p>
              </li>
            {:else}
              <p class="text-sm text-text-muted">No messages yet.</p>
            {/each}
          </ul>
          <form class="mt-3 flex gap-2" onsubmit={submitChat}>
            <label
              class="cursor-pointer rounded-lg border border-border px-3
                  py-2 text-sm hover:bg-surface-2"
              title="Send a file"
            >
              <input
                type="file"
                class="sr-only"
                onchange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) void sendFile(f);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
              📎
            </label>
            <input
              class="min-w-0 flex-1 rounded-lg border border-border
                  bg-surface-2 px-3 py-2 text-sm
                  focus-visible:outline-2 focus-visible:outline-brand"
              placeholder={t.chat.placeholder}
              bind:value={draft}
              aria-label={t.chat.placeholder}
            />
            <button
              type="submit"
              class="rounded-lg bg-brand px-3 py-2 text-sm font-medium
                  text-[#04211d] hover:opacity-90
                  focus-visible:outline-2 focus-visible:outline-white"
              disabled={!draft.trim()}>{t.chat.send}</button
            >
          </form>
        </div>
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
                {#if session.peers.find((p) => p.peerId === r.peerId)?.hand}
                  <button
                    class="rounded-md px-2 py-1 text-xs
                        hover:bg-surface-2 focus-visible:outline-2
                        focus-visible:outline-white"
                    title="Lower hand"
                    onclick={() => hostActions.lowerHand(r.peerId)}
                    >Hand down</button
                  >
                {/if}
                {#if session.peers.find((p) => p.peerId === r.peerId)?.camOn}
                  <button
                    class="rounded-md px-2 py-1 text-xs
                        hover:bg-surface-2 focus-visible:outline-2
                        focus-visible:outline-white"
                    onclick={() => hostActions.revokeSlot(r.peerId)}
                    >Camera off</button
                  >
                {/if}
                <button
                  class="rounded-md px-2 py-1 text-xs
                      hover:bg-surface-2 focus-visible:outline-2
                      focus-visible:outline-white"
                  onclick={() => hostActions.askMute(r.peerId)}
                  >{t.people.askToMute}</button
                >
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
        {#if session.noteTaker === session.peerId}
          <p class="text-sm">
            You are running AI notes.
            {notesConsentedCount}
            {notesConsentedCount === 1 ? 'person has' : 'people have'} consented.
          </p>
          <button
            class="mt-2 rounded-lg border border-border px-3 py-2 text-sm
                hover:bg-surface-2"
            onclick={stopNotes}>Stop AI notes</button
          >
          {#if session.notesText}
            <div
              class="mt-3 whitespace-pre-wrap rounded-lg bg-surface-2 p-3
                  text-sm"
            >
              {session.notesText}
            </div>
          {/if}
          {#if session.notesModelLoading}
            <p class="mt-3 text-sm text-text-muted" role="status">
              {t.call.notesModelLoading}
            </p>
          {/if}
          {#if session.transcript.length}
            <div class="mt-3 space-y-1 text-xs">
              {#each session.transcript.slice(-40) as line (line.ts + line.text)}
                <p>
                  <span class="font-medium">{line.speaker}</span>
                  <span class="text-text-muted">
                    {new Date(line.ts).toLocaleTimeString('en-GB')}</span
                  >
                  {line.text}
                </p>
              {/each}
            </div>
          {/if}
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="rounded-lg border border-border px-3 py-2 text-sm
                  hover:bg-surface-2 disabled:opacity-50"
              disabled={session.notesBusy}
              onclick={() => void updateNotes()}
              >{session.notesBusy ? 'Working…' : 'Update notes'}</button
            >
            <button
              class="rounded-lg border border-border px-3 py-2 text-sm
                  hover:bg-surface-2"
              onclick={() => downloadNotes()}>Download notes (.md)</button
            >
            <button
              class="rounded-lg border border-border px-3 py-2 text-sm
                  hover:bg-surface-2"
              onclick={shareNotes}>Share with everyone</button
            >
            <button
              class="rounded-lg border border-border px-3 py-2 text-sm
                  text-danger hover:bg-surface-2"
              onclick={() => void finalNotes().then(stopNotes)}
              >End AI notes</button
            >
          </div>
        {:else if session.noteTaker}
          <p class="text-sm">
            {session.roster.find((r) => r.peerId === session.noteTaker)?.name ??
              'A participant'}
            is running AI notes{session.notesConsent === true
              ? ' on your voice'
              : ''}.
          </p>
          {#if session.notesConsent === true}
            <button
              class="mt-2 rounded-lg border border-border px-3 py-2 text-sm
                  hover:bg-surface-2"
              onclick={revokeNotesConsent}>Revoke my consent</button
            >
          {:else}
            <p class="text-xs text-text-muted">
              Your voice is not being transcribed.
            </p>
          {/if}
        {:else}
          <p class="text-text-muted">{t.call.aiNotes}</p>
          <button
            class="mt-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium
                text-[#04211d]"
            onclick={tryStartNotes}>Start AI notes</button
          >
        {/if}
        {#if session.sharedNotes}
          <div class="mt-4 border-t border-border pt-3">
            <p class="text-sm">
              {session.sharedNotes.fromName} shared meeting notes.
            </p>
            <details class="mt-2 text-xs">
              <summary class="cursor-pointer text-text-muted">
                Preview
              </summary>
              <pre
                class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap
                    rounded-lg bg-surface-2 p-2">{session.sharedNotes.md}</pre>
            </details>
            <button
              class="mt-2 rounded-lg border border-border px-3 py-2 text-sm
                  hover:bg-surface-2"
              onclick={() => downloadNotes(session.sharedNotes!.md)}
              >Download notes (.md)</button
            >
          </div>
        {/if}
      {/if}
    </div>
  {/snippet}

  {#if ui.panel}
    {#if isMobile.current}
      <FloatPanel
        title={panelTitle[ui.panel]}
        onclose={() => (ui.panel = null)}
      >
        {@render panelBody()}
      </FloatPanel>
    {:else}
      <aside
        class="absolute inset-y-0 left-auto right-0 z-30 flex w-[360px]
          flex-col border-l border-border bg-surface p-4"
      >
        {@render panelBody()}
      </aside>
    {/if}
  {/if}

  <!-- Control bar -->
  <nav
    class="relative z-20 flex items-center justify-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3"
    aria-label="Call controls"
  >
    {#if session.muteAsk}
      <span
        class="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center
          gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs"
        role="alert"
      >
        The host asks you to mute
        <button
          class="rounded-full bg-brand px-2.5 py-0.5 font-medium
            text-[#04211d]"
          onclick={() => {
            void mediaActions.setMic(false);
            session.muteAsk = false;
          }}>Mute</button
        >
        <button
          class="text-text-muted"
          aria-label="Dismiss"
          onclick={() => (session.muteAsk = false)}>&times;</button
        >
      </span>
    {/if}
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
      {#if canShare}
        <IconButton
          label={localScreen ? 'Stop sharing' : t.call.shareScreen}
          pressed={!!localScreen}
          onclick={() => (localScreen ? stopShare() : void shareScreen())}
        >
          <MonitorUp size={22} />
        </IconButton>
      {/if}
      <IconButton
        label={session.handUp ? t.call.lowerHand : t.call.raiseHand}
        pressed={session.handUp}
        onclick={() => setHand(!session.handUp)}
      >
        <Hand size={22} />
      </IconButton>
      <span class="relative">
        <IconButton
          label={t.call.reactions}
          pressed={reactOpen}
          onclick={() => (reactOpen = !reactOpen)}
        >
          <SmilePlus size={22} />
        </IconButton>
        {#if reactOpen}
          <div
            class="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2
              gap-1 rounded-full border border-border bg-surface p-2 shadow-xl"
            role="menu"
          >
            {#each REACTION_SET as emoji (emoji)}
              <button
                role="menuitem"
                class="rounded-full p-1.5 text-xl hover:bg-surface-2
                  focus-visible:outline-2 focus-visible:outline-brand"
                aria-label="React {emoji}"
                onclick={() => {
                  sendReact(emoji);
                  reactOpen = false;
                }}>{emoji}</button
              >
            {/each}
          </div>
        {/if}
      </span>
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
        setHand(!session.handUp);
        moreOpen = false;
      }}
    >
      <Hand size={20} />
      {session.handUp ? t.call.lowerHand : t.call.raiseHand}
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
    {#if isHost}
      <button
        class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
          hover:bg-surface-2"
        onclick={toggleRecord}
      >
        <Circle size={20} class={session.recording ? 'text-danger' : ''} />
        {session.recording ? 'Stop recording' : 'Record this meeting'}
      </button>
    {/if}
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
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      onclick={() => {
        moreOpen = false;
        qrOpen = true;
      }}
    >
      <QrCodeIcon size={20} />
      {t.call.shareQr}
    </button>
    <button
      class="flex items-center gap-3 rounded-lg px-3 py-3 text-left
        hover:bg-surface-2"
      aria-pressed={settings.relayOnly}
      onclick={() => (settings.relayOnly = !settings.relayOnly)}
    >
      <Lock size={20} />
      Hide my IP address
      {#if settings.relayOnly}
        <span class="ml-auto text-xs text-brand">on</span>
      {/if}
    </button>
    {#if session.peers.length > 0}
      <div
        class="mt-2 rounded-lg border border-border p-3 text-xs
          text-text-muted"
        aria-label="Connection details"
      >
        <p class="mb-2 font-semibold text-text">Connection details</p>
        {#each session.peers as p (p.peerId)}
          <div class="mb-1">
            <span class="text-text">{p.name}</span>: {p.state},
            {p.link}
            {#if p.rttMs >= 0}, {Math.round(p.rttMs)} ms{/if}
            {#if p.lossPct >= 0}, {p.lossPct.toFixed(1)}% loss{/if}
            {#if p.restarts > 0}, {p.restarts} restarts{/if}
            {#if p.escalations > 0}, {p.escalations} escalations{/if}
            {#if p.turnDown}, relay unavailable{/if}
          </div>
        {/each}
      </div>
    {/if}
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

<!-- Meeting link as QR (doc 06). -->
{#if session.link}
  <Dialog bind:open={qrOpen} title={t.call.shareQr}>
    <div class="flex flex-col items-center gap-3">
      <QrCode text={session.link} />
      <p class="text-sm text-text-muted">{t.call.shareQrHint}</p>
      <p class="break-all text-center text-xs text-text-muted">
        {session.link}
      </p>
      <Button variant="secondary" onclick={copyLink}>
        {copied ? t.prejoin.copied : t.call.copyLink}
      </Button>
    </div>
  </Dialog>
{/if}

<!-- AI notes consent ask (doc 06 s.6): 30 s, decline is the default. -->
{#if session.notesAsk}
  <Dialog
    open
    title="{session.notesAsk.fromName} wants to use AI notes"
    onclose={() => answerNotesConsent(false)}
  >
    <p class="mb-4 text-sm text-text-muted">
      Allow their AI provider to transcribe your voice? You can change this any
      time. No answer in 30 seconds counts as decline.
    </p>
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => answerNotesConsent(false)}
        >Decline</Button
      >
      <Button onclick={() => answerNotesConsent(true)}>Allow</Button>
    </div>
  </Dialog>
{/if}

<!-- Host consent before recording (doc 06 s.5). -->
<Dialog bind:open={recConsent} title="Record this meeting?">
  <p class="mb-4 text-sm text-text-muted">
    Everyone in the meeting will see a notice that you are recording. The file
    stays on your device.
  </p>
  <div class="flex justify-end gap-2">
    <Button variant="secondary" onclick={() => (recConsent = false)}>
      Cancel
    </Button>
    <Button
      onclick={() => {
        recConsent = false;
        void startRecording();
      }}>Start recording</Button
    >
  </div>
</Dialog>

<!-- Announcement region for screen readers (joins, leaves, knocks). -->
<div aria-live="polite" class="sr-only">{session.announce}</div>
