<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import { config } from '../config';
  import Button from '../lib/ui/Button.svelte';
  import Input from '../lib/ui/Input.svelte';
  import Footer from '../lib/ui/Footer.svelte';
  import MeshLogo from '../lib/ui/MeshLogo.svelte';
  import { navigate } from '../lib/router.svelte';
  import { formatLink, parseLink } from '../lib/core/room/link';
  import { createRoom } from '../lib/core/room/room';
  import { saveHostKey } from '../lib/core/room/hostKeyStore';
  import { persistName, settings } from '../lib/stores/settings.svelte';
  import { enterRoom, setHostIdentity } from '../lib/stores/session.svelte';
  import { toast } from '../lib/stores/ui.svelte';
  import {
    ShieldCheck,
    MonitorSmartphone,
    Sparkles,
    Download,
    Settings,
  } from '@lucide/svelte';
  import { install, requestInstall } from '../lib/platform/install.svelte';
  import InstallSheet from '../lib/ui/InstallSheet.svelte';
  import SettingsDialog from '../lib/ui/SettingsDialog.svelte';
  import QrScanDialog from '../lib/ui/QrScanDialog.svelte';
  import { QrCode, Check, LoaderCircle } from '@lucide/svelte';

  let settingsOpen = $state(false);

  let joinLink = $state('');
  let name = $state(settings.displayName);
  let scanOpen = $state(false);
  let startStep = $state(-1);

  async function startMeeting() {
    startStep = 0;
    try {
      persistName(name);
      const room = await createRoom(config.appUrl);
      startStep = 1;
      await saveHostKey(room.link.roomId, room.host);
      setHostIdentity(room.host);
      startStep = 2;
      enterRoom(room.link, room.url, 'host');
      navigate(
        `/r/${room.link.roomId}#${room.link.roomSecret}.${room.link.hostThumb}`,
      );
    } catch (e) {
      console.error('create meeting failed', e);
      startStep = -1;
      toast(t.home.startFailed);
    }
  }

  function onQrFound(link: string) {
    joinLink = link;
    join();
  }

  function join() {
    const room = parseLink(joinLink.trim());
    if (!room) {
      toast(t.home.joinInvalid);
      return;
    }
    persistName(name);
    const link = formatLink(config.appUrl, room);
    enterRoom(room, link, 'guest');
    navigate(`/r/${room.roomId}#${room.roomSecret}.${room.hostThumb}`);
  }

  const features = [
    { icon: ShieldCheck, ...t.home.features.direct },
    { icon: MonitorSmartphone, ...t.home.features.pwa },
    { icon: Sparkles, ...t.home.features.ai },
  ];
</script>

<svelte:head>
  <title>{t.appName} · {t.tagline}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4">
  <header class="flex items-center gap-3 py-5">
    <MeshLogo size={36} />
    <span class="text-xl font-semibold tracking-tight">{t.appName}</span>
    <span class="flex-1"></span>
    {#if install.kind !== 'hidden'}
      <Button variant="secondary" size="sm" onclick={requestInstall}>
        <Download size={16} />
        {t.install.button}
      </Button>
    {/if}
    <button
      class="rounded-lg p-2 hover:bg-surface-2 focus-visible:outline-2
        focus-visible:outline-brand"
      aria-label="Settings"
      onclick={() => (settingsOpen = true)}
    >
      <Settings size={20} />
    </button>
  </header>
  <InstallSheet />
  <SettingsDialog bind:open={settingsOpen} />

  <main
    class="flex flex-1 flex-col justify-center gap-10 py-8 md:grid md:grid-cols-2 md:items-center md:gap-16"
  >
    <section class="order-2 md:order-1">
      <h1
        class="text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
      >
        {t.home.hero}
      </h1>
      <p class="mt-3 text-lg text-text-muted">{t.home.heroSub}</p>
    </section>

    <section
      class="order-1 rounded-xl border border-border bg-surface p-6 md:order-2"
    >
      <Input
        label={t.home.nameLabel}
        placeholder={t.home.namePlaceholder}
        bind:value={name}
        maxlength={40}
        autocomplete="name"
      />
      <Button
        class="mt-4 w-full"
        size="lg"
        disabled={name.trim().length === 0 || startStep >= 0}
        onclick={startMeeting}
      >
        {t.home.startMeeting}
      </Button>

      {#if startStep >= 0}
        <div
          class="mt-4 rounded-lg border border-border bg-surface-2 p-4"
          role="status"
          aria-live="polite"
        >
          <ol class="space-y-2 text-sm">
            {#each t.home.startSteps as label, i (label)}
              <li
                class="flex items-center gap-2"
                class:text-text-muted={i > startStep}
              >
                {#if i < startStep}
                  <Check size={16} class="text-brand" aria-hidden="true" />
                {:else if i === startStep}
                  <LoaderCircle
                    size={16}
                    class="animate-spin text-brand"
                    aria-hidden="true"
                  />
                {:else}
                  <span
                    class="h-4 w-4 rounded-full border border-border"
                    aria-hidden="true"
                  ></span>
                {/if}
                {label}
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      <div class="my-4 flex items-center gap-3 text-sm text-text-muted">
        <span class="h-px flex-1 bg-border"></span>
        {t.home.or}
        <span class="h-px flex-1 bg-border"></span>
      </div>

      <form
        class="flex gap-2"
        onsubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <input
          type="text"
          aria-label={t.home.joinLinkLabel}
          placeholder={t.home.joinLinkPlaceholder}
          bind:value={joinLink}
          class="h-11 min-w-0 flex-1 rounded-lg border border-border
            bg-surface-2 px-3 text-base text-text placeholder:text-text-muted
            focus-visible:outline-2 focus-visible:outline-brand"
        />
        <Button type="submit" variant="secondary" disabled={!joinLink.trim()}>
          {t.home.join}
        </Button>
      </form>
      <button
        class="mt-3 inline-flex items-center gap-2 text-sm text-text-muted
          hover:text-text focus-visible:outline-2
          focus-visible:outline-brand"
        onclick={() => (scanOpen = true)}
      >
        <QrCode size={16} aria-hidden="true" />
        {t.home.qrJoin}
      </button>
      <QrScanDialog bind:open={scanOpen} onFound={onQrFound} />
    </section>
  </main>

  <section class="grid gap-4 py-6 sm:grid-cols-3">
    {#each features as f (f.title)}
      <div class="rounded-xl border border-border bg-surface p-4">
        <f.icon size={22} class="text-brand" aria-hidden="true" />
        <h2 class="mt-2 font-medium">{f.title}</h2>
        <p class="mt-1 text-sm text-text-muted">{f.body}</p>
      </div>
    {/each}
  </section>

  <section class="pb-4">
    <h2 class="font-medium">{t.home.how.title}</h2>
    <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-muted">
      {#each t.home.how.steps as step (step)}
        <li>{step}</li>
      {/each}
    </ol>
  </section>

  <Footer />
</div>
