<script lang="ts">
  /**
   * The mesh mark: four nodes joined by six links (doc 05 sections 1 and 3).
   * `animate` pulses the nodes, used for the lobby waiting state. Motion is
   * disabled automatically via the global prefers-reduced-motion rule.
   */
  let {
    size = 64,
    animate = false,
  }: {
    size?: number;
    animate?: boolean;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 512 512"
  role="img"
  aria-label="Meshly"
  class:animate
>
  <rect width="512" height="512" rx="112" class="fill-[#0B1117]" />
  <g stroke="currentColor" stroke-width="14" fill="none" class="text-brand">
    <path d="M136 136 L376 136 L376 376 L136 376 Z" />
    <path d="M136 136 L376 376" />
    <path d="M376 136 L136 376" />
  </g>
  <g fill="currentColor" class="text-brand">
    <circle cx="136" cy="136" r="30" class={animate ? 'node n1' : ''} />
    <circle cx="376" cy="136" r="30" class={animate ? 'node n2' : ''} />
    <circle cx="136" cy="376" r="30" class={animate ? 'node n3' : ''} />
    <circle cx="376" cy="376" r="30" class={animate ? 'node n4' : ''} />
  </g>
</svg>

<style>
  .animate .node {
    animation: pulse 1.6s ease-in-out infinite;
  }
  .n2 {
    animation-delay: 0.4s !important;
  }
  .n3 {
    animation-delay: 0.8s !important;
  }
  .n4 {
    animation-delay: 1.2s !important;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.25;
    }
  }
</style>
