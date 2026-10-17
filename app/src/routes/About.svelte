<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
  import { config } from '../config';
</script>

<svelte:head>
  <title>{t.about.title}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col px-4">
  <header class="flex items-center gap-3 py-5">
    <MeshLogo size={32} />
    <span class="text-lg font-semibold tracking-tight">{t.appName}</span>
  </header>

  <main class="prose-sm flex-1 text-text">
    <h1 class="text-2xl font-semibold">{t.about.title}</h1>
    <p class="mt-4 text-text-muted">
      Meshly is a free meeting app that runs entirely in your browser. There is
      no meeting server: audio, video, screen share, chat and files travel
      directly between participants' devices over encrypted WebRTC connections.
    </p>
    <p class="mt-3 text-text-muted">
      To find each other, browsers exchange encrypted messages through public
      Nostr relays and MQTT brokers. Those relays carry only ciphertext. Calls
      connect directly where possible; a small relay we run is used only when a
      direct path cannot be found.
    </p>
    <p class="mt-3 text-text-muted">
      Nothing about your meeting is stored by us. There are no accounts, no
      analytics and no tracking.
    </p>
    <p class="mt-6 text-sm text-text-muted">
      {t.footer.credit} · v{config.version} · {config.buildTime}
    </p>
  </main>

  <Footer />
</div>
