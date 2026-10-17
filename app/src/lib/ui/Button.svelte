<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
  type Size = 'md' | 'lg' | 'sm';

  let {
    variant = 'primary',
    size = 'md',
    children,
    class: cls = '',
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    children: Snippet;
    class?: string;
  } & HTMLButtonAttributes = $props();

  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'transition-colors duration-150 ease-out focus-visible:outline-2 ' +
    'focus-visible:outline-offset-2 focus-visible:outline-brand ' +
    'disabled:cursor-not-allowed disabled:opacity-50';
  const variants: Record<Variant, string> = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong',
    secondary: 'bg-surface-2 text-text hover:bg-border border border-border',
    danger: 'bg-danger text-white hover:opacity-90',
    ghost: 'text-text hover:bg-surface-2',
  };
  const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
</script>

<button class="{base} {variants[variant]} {sizes[size]} {cls}" {...rest}>
  {@render children()}
</button>
