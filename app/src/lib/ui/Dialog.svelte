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
  <h2 class="mb-4 text-lg font-semibold">{title}</h2>
  {@render children()}
</dialog>
