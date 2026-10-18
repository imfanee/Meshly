<script lang="ts">
  import type { Snippet } from 'svelte';
  import { GripHorizontal } from '@lucide/svelte';

  /**
   * Floating panel for small screens (doc 05): draggable by its grip
   * bar, resizable from the corner handle, and with adjustable surface
   * opacity so video and call controls stay visible behind it.
   */
  let {
    title,
    onclose,
    children,
  }: {
    title: string;
    onclose?: () => void;
    children: Snippet;
  } = $props();

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

  let w = $state(Math.min(vw() * 0.92, 420));
  let h = $state(Math.min(vh() * 0.58, 560));
  let x = $state((vw() - Math.min(vw() * 0.92, 420)) / 2);
  let y = $state(vh() * 0.08);
  let opacity = $state(1);

  let drag: { px: number; py: number; x: number; y: number } | null = null;
  let sizing: { px: number; py: number; w: number; h: number } | null = null;

  function gripDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { px: e.clientX, py: e.clientY, x, y };
  }
  function gripMove(e: PointerEvent) {
    if (!drag) return;
    x = clamp(drag.x + e.clientX - drag.px, 0, Math.max(0, vw() - w));
    y = clamp(drag.y + e.clientY - drag.py, 0, Math.max(0, vh() - h));
  }

  function sizeDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sizing = { px: e.clientX, py: e.clientY, w, h };
  }
  function sizeMove(e: PointerEvent) {
    if (!sizing) return;
    w = clamp(sizing.w + e.clientX - sizing.px, 260, vw() - x);
    h = clamp(sizing.h + e.clientY - sizing.py, 180, vh() - y);
  }
</script>

<div
  role="dialog"
  aria-label={title}
  class="fixed z-40 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
  style:left="{x}px"
  style:top="{y}px"
  style:width="{w}px"
  style:height="{h}px"
  onkeydown={(e) => e.key === 'Escape' && onclose?.()}
  tabindex="-1"
>
  <!-- Translucent surface; content stays fully readable on top. -->
  <div
    class="absolute inset-0 rounded-2xl border border-border bg-surface"
    style:opacity
    aria-hidden="true"
  ></div>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      role="button"
      tabindex="0"
      aria-label="Move panel. Arrow keys also move it."
      class="flex cursor-move touch-none select-none items-center gap-2
        border-b border-border px-3 py-1.5"
      onpointerdown={gripDown}
      onpointermove={gripMove}
      onpointerup={() => (drag = null)}
      onpointercancel={() => (drag = null)}
      onkeydown={(e) => {
        const d = 16;
        if (e.key === 'ArrowLeft') x = clamp(x - d, 0, vw() - w);
        else if (e.key === 'ArrowRight') x = clamp(x + d, 0, vw() - w);
        else if (e.key === 'ArrowUp') y = clamp(y - d, 0, vh() - h);
        else if (e.key === 'ArrowDown') y = clamp(y + d, 0, vh() - h);
        else return;
        e.preventDefault();
      }}
    >
      <GripHorizontal size={16} class="text-text-muted" aria-hidden="true" />
      <span class="text-xs text-text-muted">{title}</span>
      <input
        type="range"
        min="0.4"
        max="1"
        step="0.05"
        bind:value={opacity}
        aria-label="Panel opacity"
        class="ml-auto w-20 accent-brand"
        onpointerdown={(e) => e.stopPropagation()}
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col p-4 pt-2">
      {@render children()}
    </div>
  </div>
  <button
    class="absolute bottom-0.5 right-0.5 cursor-nwse-resize touch-none
      rounded p-1.5 text-text-muted hover:text-text
      focus-visible:outline-2 focus-visible:outline-brand"
    aria-label="Resize panel"
    onpointerdown={sizeDown}
    onpointermove={sizeMove}
    onpointerup={() => (sizing = null)}
    onpointercancel={() => (sizing = null)}
  >
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M13 1 L13 13 L1 13 Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
  </button>
</div>
