<script lang="ts">
  import { onDestroy } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import { parseLink } from '../core/room/link';

  /**
   * QR scan: camera loop plus image-file decode (doc 06 join UX).
   * onFound is called with a parsed Meshly link; the caller navigates.
   */
  let {
    open = $bindable(false),
    onFound,
  }: {
    open: boolean;
    onFound: (link: string) => void;
  } = $props();

  let mode = $state<'pick' | 'camera' | 'error'>('pick');
  let error = $state('');
  let stream: MediaStream | null = null;
  let videoEl = $state<HTMLVideoElement>();
  let raf = 0;
  let fileInput = $state<HTMLInputElement>();

  async function scanData(data: ImageData): Promise<string | null> {
    const { default: jsQR } = await import('jsqr');
    const r = jsQR(data.data, data.width, data.height);
    return r?.data && parseLink(r.data) ? r.data : null;
  }

  async function fromCamera() {
    mode = 'camera';
    error = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (!videoEl) throw new Error('no video element');
      videoEl.srcObject = stream;
      await videoEl.play();
      tick();
    } catch {
      error = 'Could not open the camera for scanning.';
      mode = 'error';
    }
  }

  let scanning = false;
  let lastScan = 0;

  function tick() {
    raf = requestAnimationFrame(tick);
    if (!videoEl || videoEl.readyState < 2 || scanning) return;
    const now = Date.now();
    if (now - lastScan < 300) return;
    lastScan = now;
    const c = document.createElement('canvas');
    c.width = videoEl.videoWidth;
    c.height = videoEl.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoEl, 0, 0);
    scanning = true;
    void scanData(ctx.getImageData(0, 0, c.width, c.height))
      .then((link) => {
        if (link) done(link);
      })
      .finally(() => (scanning = false));
  }

  async function fromFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) {
      error = 'Could not read that image.';
      mode = 'error';
      return;
    }
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx?.drawImage(bmp, 0, 0);
    const link = ctx
      ? await scanData(ctx.getImageData(0, 0, c.width, c.height))
      : null;
    if (link) done(link);
    else {
      error = 'No Meshly QR code found in that image.';
      mode = 'error';
    }
  }

  function done(link: string) {
    cleanup();
    open = false;
    onFound(link);
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  onDestroy(cleanup);
  $effect(() => {
    if (!open) cleanup();
  });
</script>

<Dialog bind:open title="Scan a meeting QR code">
  {#if mode === 'pick'}
    <div class="grid gap-2 text-sm">
      <button
        class="rounded-lg border border-border px-3 py-3 text-left
          hover:bg-surface-2"
        onclick={fromCamera}>Scan with camera</button
      >
      <button
        class="rounded-lg border border-border px-3 py-3 text-left
          hover:bg-surface-2"
        onclick={() => fileInput?.click()}>Choose a QR image</button
      >
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        class="hidden"
        onchange={fromFile}
      />
    </div>
  {:else if mode === 'camera'}
    <video bind:this={videoEl} playsinline muted class="w-full rounded-lg"
    ></video>
    <Button variant="secondary" class="mt-2" onclick={() => (mode = 'pick')}>
      Back
    </Button>
  {:else}
    <p class="text-sm text-danger">{error}</p>
    <Button variant="secondary" class="mt-2" onclick={() => (mode = 'pick')}>
      Back
    </Button>
  {/if}
</Dialog>
