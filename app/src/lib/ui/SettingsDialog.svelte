<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from './Dialog.svelte';
  import {
    persistName,
    persistTheme,
    settings,
  } from '../stores/settings.svelte';
  import { localMedia } from '../core/media/localMedia';

  /**
   * Settings dialog (doc 05): appearance (theme + name, persisted), devices
   * (mic/camera pickers), advanced (relay-only, transports, diagnostics).
   */

  let { open = $bindable(false) }: { open: boolean } = $props();

  let mics = $state<MediaDeviceInfo[]>([]);
  let cams = $state<MediaDeviceInfo[]>([]);
  let micId = $state('');
  let camId = $state('');

  async function loadDevices() {
    const list = await localMedia.listDevices().catch(() => []);
    mics = list.filter((d) => d.kind === 'audioinput');
    cams = list.filter((d) => d.kind === 'videoinput');
    micId = localMedia.snapshot().audio?.getSettings().deviceId ?? '';
    camId = localMedia.snapshot().video?.getSettings().deviceId ?? '';
  }
  $effect(() => {
    if (open) void loadDevices();
  });
  onMount(() => {
    const h = () => void loadDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', h);
    return () =>
      navigator.mediaDevices?.removeEventListener?.('devicechange', h);
  });

  const label = (d: MediaDeviceInfo, i: number) => d.label || `Device ${i + 1}`;
</script>

<Dialog bind:open title="Settings">
  <div class="space-y-5 text-sm">
    <section class="space-y-2">
      <h3 class="font-medium">Appearance</h3>
      <label class="block">
        <span class="text-text-muted">Your name</span>
        <input
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={settings.displayName}
          oninput={(e) => persistName((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="block">
        <span class="text-text-muted">Theme</span>
        <select
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={settings.theme}
          onchange={(e) =>
            persistTheme(
              (e.target as HTMLSelectElement).value as
                'system' | 'light' | 'dark',
            )}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </section>

    <section class="space-y-2">
      <h3 class="font-medium">Devices</h3>
      <label class="block">
        <span class="text-text-muted">Microphone</span>
        <select
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={micId}
          onchange={async (e) => {
            const id = (e.target as HTMLSelectElement).value;
            micId = id;
            await localMedia.switchAudioDevice(id);
          }}
        >
          {#each mics as d, i (d.deviceId)}
            <option value={d.deviceId}>{label(d, i)}</option>
          {/each}
        </select>
      </label>
      <label class="block">
        <span class="text-text-muted">Camera</span>
        <select
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={camId}
          onchange={async (e) => {
            const id = (e.target as HTMLSelectElement).value;
            camId = id;
            await localMedia.switchVideoDevice(id);
          }}
        >
          {#each cams as d, i (d.deviceId)}
            <option value={d.deviceId}>{label(d, i)}</option>
          {/each}
        </select>
      </label>
    </section>

    <section class="space-y-2">
      <h3 class="font-medium">Advanced</h3>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-brand"
          bind:checked={settings.relayOnly}
        />
        Hide my IP address (relay all media, may be slower)
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-brand"
          bind:checked={settings.transportNostr}
        />
        Nostr relays for signalling
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-brand"
          bind:checked={settings.transportMqtt}
        />
        MQTT brokers for signalling
      </label>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-brand"
          bind:checked={settings.showConnectionDetails}
        />
        Show connection details during calls
      </label>
    </section>
  </div>
</Dialog>
