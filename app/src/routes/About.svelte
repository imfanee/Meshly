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
    <h2 class="mt-6 font-semibold">How it works</h2>
    <ul class="mt-2 list-disc space-y-2 pl-5 text-text-muted">
      <li>
        A meeting link carries a random secret in its URL fragment. It never
        reaches any server; it is used in your browser to encrypt everything the
        meeting sends.
      </li>
      <li>
        To find each other, browsers exchange small signed, encrypted messages
        through public Nostr relays and MQTT brokers. The relays see only
        ciphertext; they cannot read names, keys or media.
      </li>
      <li>
        Calls connect directly where possible using free public STUN. Only when
        a direct path fails do we use a small TURN relay we operate ourselves,
        and even then the traffic stays end-to-end encrypted.
      </li>
      <li>
        Everyone connects to everyone in a full mesh, so calls work without a
        central media server and are kept to 12 participants for quality.
      </li>
      <li>
        The only server-side code is a tiny script that mints short-lived TURN
        credentials when a pair cannot connect directly.
      </li>
    </ul>
    <h2 class="mt-6 font-semibold">What we do not have</h2>
    <p class="mt-2 text-text-muted">
      No accounts, no analytics, no tracking, no cookies. Nothing about your
      meeting is stored by us.
    </p>
    <p class="mt-6 text-sm text-text-muted">
      {t.footer.credit} · v{config.version} · {config.buildTime}
    </p>
  </main>

  <Footer />
</div>
