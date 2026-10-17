<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    label,
    value = $bindable(''),
    id = `in-${Math.random().toString(36).slice(2, 9)}`,
    class: cls = '',
    ...rest
  }: {
    label: string;
    value?: string;
    id?: string;
    class?: string;
  } & Omit<HTMLInputAttributes, 'id'> = $props();
</script>

<div class="flex flex-col gap-1.5 {cls}">
  <label for={id} class="text-sm font-medium text-text">{label}</label>
  <input
    {id}
    bind:value
    class="h-11 rounded-lg border border-border bg-surface-2 px-3 text-base
      text-text placeholder:text-text-muted focus-visible:outline-2
      focus-visible:outline-offset-1 focus-visible:outline-brand"
    {...rest}
  />
</div>
