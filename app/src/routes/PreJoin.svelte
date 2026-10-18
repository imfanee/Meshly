<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import Button from '../lib/ui/Button.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Input from '../lib/ui/Input.svelte';
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
  import Tooltip from '../lib/ui/Tooltip.svelte';
  import { session, startHost, startGuest } from '../lib/stores/session.svelte';
  import { persistName, settings } from '../lib/stores/settings.svelte';
  import { toast } from '../lib/stores/ui.svelte';
  import { localMedia } from '../lib/core/media/localMedia';
  import { activeSpeaker } from '../lib/core/media/activeSpeaker';
  import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Copy,
    Share2,
    LoaderCircle,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';

  let name = $state(settings.displayName);
  let copied = $state(false);
  let localStream = $state<MediaStream | null>(null);
  let permissionDenied = $state(false);

  const isHost = $derived(session.role === 'host');

  let micLevel = $state(0);
  onMount(() => {
    const off = localMedia.onChange(
      () => (localStream = localMedia.snapshot().stream),
    );
    const offSpeaker = activeSpeaker.subscribe(
      () => (micLevel = activeSpeaker.micLevel),
    );
    localMedia
      .acquire(settings.micOn, settings.camOn)
      .then(() => {
        localStream = localMedia.snapshot().stream;
        activeSpeaker.watchLocal(localStream);
      })
      .catch(() => (permissionDenied = true));
    return () => {
      off();
      offSpeaker();
    };
  });

  function attachStream(node: HTMLVideoElement, stream: MediaStream | null) {
    node.srcObject = stream;
    return {
      update(s: MediaStream | null) {
        node.srcObject = s;
      },
    };
  }

  async function toggleMic() {
    settings.micOn = !settings.micOn;
    await localMedia.setMic(settings.micOn).catch(() => undefined);
  }
  async function toggleCam() {
    settings.camOn = !settings.camOn;
    await localMedia.setCam(settings.camOn).catch(() => undefined);
  }

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

  async function shareLink() {
    if (!session.link) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: session.link, title: 'Meshly' });
        return;
      } catch {
        /* user dismissed: fall through to copy */
      }
    }
    copyLink();
  }

  let joining = $state(false);

  async function proceed() {
    if (joining) return;
    joining = true;
    persistName(name);
    try {
      if (isHost) await startHost(name || t.call.you);
      else await startGuest(name || t.call.you, settings.camOn);
    } catch {
      toast(t.errors.retry);
      joining = false;
    }
  }
</script>

<svelte:head>
  <title>{t.appName} · {t.tagline}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
  <header class="flex items-center gap-3 py-5">
    <MeshLogo size={32} />
    <span class="text-lg font-semibold tracking-tight">{t.appName}</span>
  </header>

  <main class="flex flex-1 flex-col gap-4">
    <div
      class="relative aspect-video w-full overflow-hidden rounded-xl border
        border-border bg-surface-2"
      aria-label={t.prejoin.previewLabel}
    >
      {#if settings.camOn && localStream?.getVideoTracks().length}
        <video
          use:attachStream={localStream}
          autoplay
          playsinline
          muted
          class="h-full w-full object-cover"
        ></video>
      {:else if permissionDenied}
        <div
          class="flex h-full items-center justify-center px-4 text-center text-sm
            text-danger"
        >
          {t.prejoin.permissionBlocked}
        </div>
      {:else if settings.camOn}
        <div
          class="flex h-full items-center justify-center text-sm text-text-muted"
        >
          {t.prejoin.permissionPrompt}
        </div>
      {:else}
        <div
          class="flex h-full items-center justify-center text-sm text-text-muted"
        >
          {t.prejoin.cameraOff}
        </div>
      {/if}
      <span
        class="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5
          text-xs text-white">{name.trim() || t.call.you}</span
      >
      {#if settings.micOn}
        <span
          class="absolute bottom-2 right-2 h-1.5 w-16 overflow-hidden
            rounded-full bg-white/20"
          aria-hidden="true"
        >
          <span
            class="block h-full rounded-full bg-brand transition-[width]
              duration-100"
            style="width: {Math.min(100, micLevel * 400)}%"
          ></span>
        </span>
      {/if}
    </div>

    <div class="flex items-center justify-center gap-3">
      <Tooltip text={settings.micOn ? t.prejoin.micOn : t.prejoin.micOff}>
        <IconButton
          label={settings.micOn ? t.prejoin.micOn : t.prejoin.micOff}
          pressed={settings.micOn}
          onclick={toggleMic}
        >
          {#if settings.micOn}<Mic size={22} />{:else}<MicOff size={22} />{/if}
        </IconButton>
      </Tooltip>
      <Tooltip text={settings.camOn ? t.prejoin.cameraOn : t.prejoin.cameraOff}>
        <IconButton
          label={settings.camOn ? t.prejoin.cameraOn : t.prejoin.cameraOff}
          pressed={settings.camOn}
          onclick={toggleCam}
        >
          {#if settings.camOn}<Video size={22} />{:else}<VideoOff
              size={22}
            />{/if}
        </IconButton>
      </Tooltip>
    </div>

    <Input
      label={t.prejoin.nameLabel}
      placeholder={t.home.namePlaceholder}
      bind:value={name}
      maxlength={40}
      autocomplete="name"
    />

    <Button
      size="lg"
      class="w-full"
      disabled={name.trim().length === 0 || joining}
      onclick={proceed}
    >
      {#if joining}
        <LoaderCircle size={18} class="animate-spin" aria-hidden="true" />
        {t.prejoin.connecting}
      {:else}
        {isHost ? t.prejoin.startMeeting : t.prejoin.askToJoin}
      {/if}
    </Button>
    {#if joining}
      <p class="mt-2 text-center text-xs text-text-muted" role="status">
        {t.prejoin.connectingHint}
      </p>
    {/if}

    {#if isHost && session.link}
      <div class="mt-2 rounded-xl border border-border bg-surface p-4">
        <h2 class="font-medium">{t.prejoin.linkCardTitle}</h2>
        <p class="mt-1 text-sm text-text-muted">{t.prejoin.linkCardBody}</p>
        <div class="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onclick={copyLink}>
            <Copy size={16} />
            {copied ? t.prejoin.copied : t.prejoin.copyLink}
          </Button>
          <Button variant="secondary" size="sm" onclick={shareLink}>
            <Share2 size={16} />
            {t.prejoin.shareLink}
          </Button>
        </div>
      </div>
    {/if}
  </main>

  <Footer />
</div>
