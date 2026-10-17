<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Bottom sheet (mobile pattern); slides over content, Esc or backdrop closes. */
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

  function close() {
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-40 bg-black/50"
    role="presentation"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  ></div>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto
      rounded-t-2xl border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]
      text-text"
    tabindex="-1"
  >
    <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-border"></div>
    <h2 class="mb-3 text-base font-semibold">{title}</h2>
    {@render children()}
  </div>
{/if}
