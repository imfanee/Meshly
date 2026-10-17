<script lang="ts">
  /**
   * Participant tile, doc 05 section 4.4: video (cover) or avatar with
   * initials on a colour derived from peerId; name bottom-left; mic-off icon;
   * connection dot (green direct, amber relayed, red poor); speaking ring.
   */
  import { MicOff, Pin, Hand, TriangleAlert } from '@lucide/svelte';
  import { activeSpeaker } from '../core/media/activeSpeaker';
  import type { LinkKind, LinkQuality } from '../core/webrtc/peerManager';

  interface Props {
    peerId: string;
    name: string;
    stream: MediaStream | null;
    camOn: boolean;
    micOn: boolean;
    hand?: boolean;
    /** TURN escalation needed but the credential endpoint is down. */
    turnDown?: boolean;
    link?: LinkKind;
    quality?: LinkQuality;
    self?: boolean;
    large?: boolean;
    isHost?: boolean;
    canModerate?: boolean;
    onRemove?: () => void;
    /** Doc 04 s.3: tile visibility -> watch hint to the remote peer. */
    onVisible?: (visible: boolean) => void;
  }

  let {
    peerId,
    name,
    stream,
    camOn,
    micOn,
    hand = false,
    turnDown = false,
    link = 'unknown',
    quality = 'unknown',
    self = false,
    large = false,
    canModerate = false,
    onRemove,
    onVisible,
  }: Props = $props();

  const AVATAR_COLOURS = [
    '#0B6B5C',
    '#7C3AED',
    '#B45309',
    '#0369A1',
    '#BE185D',
    '#3F6212',
  ];

  const avatarColour = $derived.by(() => {
    let h = 0;
    for (const c of peerId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
  });

  let speaking = $state(false);
  let isActive = $state(false);
  $effect(() =>
    activeSpeaker.subscribe(() => {
      speaking = self
        ? activeSpeaker.micLevel > 0.02
        : activeSpeaker.isSpeaking(peerId);
      isActive = activeSpeaker.active === peerId;
    }),
  );

  const dotColour = $derived(
    link === 'relayed'
      ? 'bg-amber-400'
      : quality === 'poor'
        ? 'bg-red-400'
        : 'bg-emerald-400',
  );
  const dotLabel = $derived(
    link === 'relayed'
      ? 'Relayed connection'
      : quality === 'poor'
        ? 'Poor connection'
        : 'Direct connection',
  );

  function attachStream(node: HTMLVideoElement, s: MediaStream | null) {
    node.srcObject = s;
    return {
      update(n: MediaStream | null) {
        node.srcObject = n;
      },
    };
  }

  let menuOpen = $state(false);

  /** IntersectionObserver -> onVisible for the off-screen pause hint. */
  function observeVisibility(node: HTMLElement) {
    if (typeof IntersectionObserver === 'undefined' || !onVisible) return;
    const io = new IntersectionObserver(
      (entries) => onVisible(entries[0]?.isIntersecting !== false),
      { threshold: 0.25 },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<div
  use:observeVisibility
  class="group relative w-full overflow-hidden rounded-xl bg-surface
    {large ? '' : 'aspect-video'}
    {isActive
    ? 'ring-2 ring-brand'
    : speaking
      ? 'ring-2 ring-brand/60'
      : 'ring-1 ring-border'}"
  role="figure"
  aria-label="{name}{self ? ' (you)' : ''}, {camOn
    ? 'camera on'
    : 'camera off'}, {micOn ? 'unmuted' : 'muted'}"
>
  {#if camOn && stream}
    <video
      use:attachStream={stream}
      autoplay
      playsinline
      muted={self}
      class="h-full w-full object-cover"
      data-peer={peerId}
    ></video>
  {:else}
    <div class="flex h-full min-h-24 items-center justify-center">
      <span
        class="flex items-center justify-center rounded-full font-semibold
          text-white {large ? 'h-24 w-24 text-3xl' : 'h-14 w-14 text-lg'}"
        style="background: {avatarColour}"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    </div>
  {/if}

  <span
    class="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md
      bg-black/60 px-2 py-0.5 text-xs text-white"
  >
    {#if !micOn}<MicOff size={12} />{/if}
    {name}{self ? ' (you)' : ''}
  </span>
  {#if hand}
    <span
      class="absolute bottom-2 right-2 flex items-center gap-1 rounded-md
        bg-amber-500/80 px-1.5 py-1 text-white"
      title="Hand raised"
      aria-label="{name} has hand raised"
    >
      <Hand size={12} />
    </span>
  {/if}
  {#if turnDown}
    <span
      class="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1
        rounded-md bg-amber-600/90 px-2 py-1 text-xs text-white"
      role="alert"
    >
      <TriangleAlert size={12} />
      Relay unavailable, retrying
    </span>
  {/if}

  <span
    class="absolute right-2 top-2 flex items-center gap-1 rounded-md
      bg-black/60 px-1.5 py-1"
    title={dotLabel}
  >
    <span class="h-2 w-2 rounded-full {dotColour}" aria-hidden="true"></span>
    <span class="sr-only">{dotLabel}</span>
  </span>

  {#if canModerate}
    <button
      class="absolute left-2 top-2 hidden rounded-md bg-black/60 p-1.5
        text-white/80 hover:text-white group-hover:block
        focus-visible:outline-2 focus-visible:outline-white"
      aria-label="Pin or remove {name}"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Pin size={14} />
    </button>
    {#if menuOpen}
      <div
        class="absolute left-2 top-10 z-10 w-40 rounded-lg border border-border
          bg-surface p-1 text-xs shadow-xl"
        role="menu"
      >
        <button
          role="menuitem"
          class="w-full rounded px-2 py-1.5 text-left text-danger
            hover:bg-surface-2"
          onclick={() => {
            menuOpen = false;
            onRemove?.();
          }}>Remove from call</button
        >
      </div>
    {/if}
  {/if}
</div>
