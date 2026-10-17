<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    label,
    pressed = undefined,
    danger = false,
    size = 'md',
    children,
    class: cls = '',
    ...rest
  }: {
    /** Accessible name; every icon-only control must have one (doc 05 s.9). */
    label: string;
    /** Toggle state; renders aria-pressed when provided. */
    pressed?: boolean;
    danger?: boolean;
    size?: 'md' | 'lg';
    children: Snippet;
    class?: string;
  } & HTMLButtonAttributes = $props();

  const sizes = {
    md: 'h-12 w-12', // 48px control button, doc 05
    lg: 'h-14 w-14', // 56px mobile
  };
</script>

<button
  type="button"
  aria-label={label}
  aria-pressed={pressed}
  class="inline-flex items-center justify-center rounded-full transition-colors
    duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2
    focus-visible:outline-brand disabled:opacity-50 {danger
    ? 'bg-danger text-white hover:opacity-90'
    : pressed === true
      ? 'bg-brand text-on-brand hover:bg-brand-strong'
      : 'bg-surface-2 text-text hover:bg-border'} {sizes[size]} {cls}"
  {...rest}
>
  {@render children()}
</button>
