<script lang="ts">
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
</script>

<svelte:head>
  <title>Terms · Meshly</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col px-4">
  <header class="flex items-center gap-3 py-5">
    <MeshLogo size={32} />
    <span class="text-lg font-semibold tracking-tight">Meshly</span>
  </header>

  <main class="flex-1 text-sm leading-6 text-text">
    <h1 class="text-2xl font-semibold">Terms</h1>
    <p class="mt-4 text-text-muted">
      Meshly is provided free, as is, without warranty or uptime guarantee. Do
      not use it for unlawful purposes, to harass others, or to record people
      without the notice and consent your local law requires. Do not use it for
      emergency communications. The service may change or stop at any time.
    </p>
    <p class="mt-4 text-text-muted">
      Meshly is designed and architected by Faisal Hanif.
    </p>
  </main>

  <Footer />
</div>
