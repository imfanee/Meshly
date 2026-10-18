<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from './Dialog.svelte';
  import {
    persistAi,
    persistName,
    persistTheme,
    settings,
  } from '../stores/settings.svelte';
  import { localMedia } from '../core/media/localMedia';
  import { AI_PROVIDERS, presetOf } from '../core/ai/providers';
  import { testKey } from '../core/ai/openaiCompat';
  import type { AiProvider } from '../stores/settings.svelte';

  let testing = $state(false);
  let testResult = $state('');

  function pickProvider(p: AiProvider) {
    const preset = presetOf(p);
    settings.aiProvider = p;
    settings.aiBaseUrl = preset.baseUrl;
    settings.aiModel = preset.summaryModel;
    settings.aiTranscribeModel = preset.transcribeModel;
    persistAi();
  }

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
        <span class="text-text-muted">Display name</span>
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

    <section class="space-y-2">
      <h3 class="font-medium">AI notes</h3>
      <label class="block">
        <span class="text-text-muted">Provider</span>
        <select
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={settings.aiProvider}
          onchange={(e) =>
            pickProvider((e.target as HTMLSelectElement).value as AiProvider)}
        >
          {#each Object.entries(AI_PROVIDERS) as [id, p] (id)}
            <option value={id}>{p.label}</option>
          {/each}
        </select>
      </label>
      {#if presetOf(settings.aiProvider).needsKey}
        <label class="block">
          <span class="text-text-muted">API key</span>
          <input
            type="password"
            autocomplete="off"
            class="mt-1 w-full rounded-lg border border-border bg-surface-2
              px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
            value={settings.aiKey}
            oninput={(e) => {
              settings.aiKey = (e.target as HTMLInputElement).value;
              persistAi();
            }}
          />
        </label>
        <label class="block">
          <span class="text-text-muted">Endpoint</span>
          <input
            class="mt-1 w-full rounded-lg border border-border bg-surface-2
              px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
            value={settings.aiBaseUrl}
            oninput={(e) => {
              settings.aiBaseUrl = (e.target as HTMLInputElement).value;
              persistAi();
            }}
          />
        </label>
      {/if}
      <label class="block">
        <span class="text-text-muted">Summary model</span>
        <input
          class="mt-1 w-full rounded-lg border border-border bg-surface-2
            px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand"
          value={settings.aiModel}
          oninput={(e) => {
            settings.aiModel = (e.target as HTMLInputElement).value;
            persistAi();
          }}
        />
      </label>
      {#if presetOf(settings.aiProvider).note}
        <p class="text-xs text-text-muted">
          {presetOf(settings.aiProvider).note}
        </p>
      {/if}
      {#if presetOf(settings.aiProvider).needsKey && settings.aiKey}
        <button
          class="rounded-lg border border-border px-3 py-1.5 text-xs
            hover:bg-surface-2"
          disabled={testing}
          onclick={async () => {
            testing = true;
            testResult = '';
            try {
              await testKey(
                settings.aiBaseUrl,
                settings.aiKey,
                settings.aiModel,
              );
              testResult = 'Connected';
            } catch (e) {
              testResult = `Failed: ${String(e).slice(0, 80)}`;
            } finally {
              testing = false;
            }
          }}>{testing ? 'Testing…' : 'Test connection'}</button
        >
        {#if testResult}
          <span
            class="ml-2 text-xs {testResult === 'Connected'
              ? 'text-brand'
              : 'text-danger'}">{testResult}</span
          >
        {/if}
      {/if}
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          class="accent-brand"
          checked={settings.rememberAiKey}
          onchange={(e) => {
            settings.rememberAiKey = (e.target as HTMLInputElement).checked;
            persistAi();
          }}
        />
        Remember these settings on this device
      </label>
      <p class="text-xs text-text-muted">
        Keys are sent only to the provider and are stored here solely if you
        tick remember.
      </p>
    </section>
  </div>
</Dialog>
