<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    items,
    active = $bindable(),
    label,
    onchange,
    children,
  }: {
    items: { id: string; label: string }[];
    active: string;
    label: string;
    onchange?: (id: string) => void;
    children?: Snippet;
  } = $props();
</script>

<div
  role="tablist"
  aria-label={label}
  class="flex gap-1 rounded-lg bg-surface-2 p-1"
>
  {#each items as item (item.id)}
    <button
      role="tab"
      aria-selected={active === item.id}
      class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
        duration-150 focus-visible:outline-2 focus-visible:outline-brand
        {active === item.id
        ? 'bg-surface text-text shadow-sm'
        : 'text-text-muted hover:text-text'}"
      onclick={() => {
        active = item.id;
        onchange?.(item.id);
      }}
    >
      {item.label}
    </button>
  {/each}
</div>
{#if children}
  {@render children()}
{/if}
