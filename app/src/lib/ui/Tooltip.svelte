<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Lightweight tooltip shown on hover and keyboard focus (doc 05 section 9
   * requires tooltips on focus too).
   */
  let {
    text,
    children,
  }: {
    text: string;
    children: Snippet;
  } = $props();
</script>

<span class="group/tip relative inline-flex">
  {@render children()}
  <span
    role="tooltip"
    class="pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2
      -translate-x-1/2 whitespace-nowrap rounded-md border border-border
      bg-surface px-2 py-1 text-xs text-text opacity-0 shadow-md transition
      duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
    >{text}</span
  >
</span>
