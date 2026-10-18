<script lang="ts">
  import { renderSVG } from 'uqr';

  /** SVG QR code for a string payload (meeting links). */
  let { text, size = 220 }: { text: string; size?: number } = $props();
  const svg = $derived(
    renderSVG(text, { blackColor: '#0b0d12', whiteColor: '#ffffff' }),
  );
</script>

<div
  class="rounded-lg bg-white p-2 [&>svg]:block [&>svg]:h-auto
    [&>svg]:w-full"
  style:width="{size}px"
  role="img"
  aria-label="QR code for the meeting link"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html svg}
</div>
