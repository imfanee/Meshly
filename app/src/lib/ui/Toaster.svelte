<script lang="ts">
  import { ui, dismissToast } from '../stores/ui.svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
</script>

<!-- Toasts: bottom-left on desktop, top on mobile (doc 05 s.4.4). -->
<div
  class="pointer-events-none fixed left-4 right-4 top-4 z-[70] flex flex-col
    gap-2 sm:bottom-4 sm:left-4 sm:right-auto sm:top-auto sm:w-80"
  aria-live="polite"
>
  {#each ui.toasts as toast (toast.id)}
    <div
      animate:flip={{ duration: 150 }}
      transition:fade={{ duration: 150 }}
      class="pointer-events-auto flex items-center justify-between gap-3
        rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text
        shadow-lg"
      role="status"
    >
      <span>{toast.text}</span>
      {#if toast.kind === 'persist'}
        <button
          class="text-text-muted hover:text-text"
          aria-label="Dismiss"
          onclick={() => dismissToast(toast.id)}>&times;</button
        >
      {/if}
    </div>
  {/each}
</div>
