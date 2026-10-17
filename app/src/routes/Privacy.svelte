<script lang="ts">
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
</script>

<svelte:head>
  <title>Privacy · Meshly</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col px-4">
  <header class="flex items-center gap-3 py-5">
    <MeshLogo size={32} />
    <span class="text-lg font-semibold tracking-tight">Meshly</span>
  </header>

  <main class="flex-1 text-sm leading-6 text-text">
    <h1 class="text-2xl font-semibold">Privacy at Meshly</h1>
    <p class="mt-4">
      Meshly is a free meeting app. It has no accounts and no tracking.
    </p>
    <h2 class="mt-6 font-semibold">What we do not collect</h2>
    <p class="mt-2 text-text-muted">
      We do not store your name, your meetings, your messages, your recordings
      or your notes. There are no analytics or advertising cookies.
    </p>
    <h2 class="mt-6 font-semibold">How your call travels</h2>
    <p class="mt-2 text-text-muted">
      Audio, video, chat and files go directly between participants' devices and
      are encrypted. To set up a call, your browser exchanges encrypted messages
      through public relay networks (Nostr and MQTT); they cannot read them. To
      find a direct route, your browser contacts public STUN servers run by
      Google and Cloudflare, which see your IP address. If a direct route is
      impossible, your call is relayed, still encrypted, through a relay server
      we operate, which sees your IP address but not the content.
    </p>
    <h2 class="mt-6 font-semibold">Other participants</h2>
    <p class="mt-2 text-text-muted">
      Other participants can see your IP address, as with any peer-to-peer call,
      unless you turn on "Hide my IP address" in Settings.
    </p>
    <h2 class="mt-6 font-semibold">Our web host</h2>
    <p class="mt-2 text-text-muted">
      Our web host keeps standard server logs (IP address, time, page requested)
      for security. The secret part of a meeting link never reaches our server.
    </p>
    <h2 class="mt-6 font-semibold">On your device</h2>
    <p class="mt-2 text-text-muted">
      Meshly stores your display name, settings, and, only if you choose, your
      AI keys. You can clear them in Settings or by clearing site data.
    </p>
    <h2 class="mt-6 font-semibold">AI notes</h2>
    <p class="mt-2 text-text-muted">
      AI notes are optional. If someone uses AI notes, you are asked first; if
      you allow it, your voice is sent to their chosen AI provider under that
      provider's terms.
    </p>
    <h2 class="mt-6 font-semibold">Recording</h2>
    <p class="mt-2 text-text-muted">
      Recording can only be done by the meeting host, on their own device.
      Everyone is notified while recording is on.
    </p>
    <h2 class="mt-6 font-semibold">Honest limitations</h2>
    <p class="mt-2 text-text-muted">
      Meshly verifies people by the host admitting them, not by accounts, so
      anyone holding the link can ask to join. Public relays can observe that
      encrypted traffic exists for a room, and when, but not its contents.
    </p>
    <p class="mt-6 text-text-muted">
      Contact:
      <a href="mailto:imfanee@gmail.com" class="underline">imfanee@gmail.com</a>
      ·
      <a
        href="https://github.com/imfanee"
        target="_blank"
        rel="noopener noreferrer"
        class="underline">GitHub</a
      >
    </p>
  </main>

  <Footer />
</div>
