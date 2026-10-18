<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Modal dialog on the native <dialog> element: focus trapping and Esc
   * handling come free; focus is returned on close (doc 05 section 9).
   */
  let {
    open = $bindable(false),
    title,
    onclose,
    children,
  }: {
    open: boolean;
    title: string;
    onclose?: () => void;
    children: Snippet;
  } = $props();

  let el: HTMLDialogElement;

  $effect(() => {
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  });
</script>

<dialog
  bind:this={el}
  class="m-auto w-[min(92vw,28rem)] rounded-xl border border-border bg-surface
    p-6 text-text shadow-2xl backdrop:bg-black/50"
  onclose={() => {
    open = false;
    onclose?.();
  }}
  aria-label={title}
>
  <div class="mb-4 flex items-center justify-between gap-4">
    <h2 class="text-lg font-semibold">{title}</h2>
    <button
      class="rounded-lg p-1.5 text-text-muted hover:bg-surface-2
        hover:text-text focus-visible:outline-2 focus-visible:outline-brand"
      aria-label="Close"
      onclick={() => el.close()}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg
      >
    </button>
  </div>
  {@render children()}
</dialog>
