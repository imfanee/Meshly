<script lang="ts">
  import { t } from '../i18n/en-GB';
  import Sheet from './Sheet.svelte';
  import { install } from '../platform/install.svelte';
  import { Share, PlusSquare, Menu } from '@lucide/svelte';
</script>

<Sheet bind:open={install.sheetOpen} title={t.install.sheetTitle}>
  {#if install.kind === 'ios-safari'}
    <ol class="space-y-3 text-sm text-text">
      <li class="flex items-center gap-3">
        <Share size={20} class="text-brand" /> 1. {t.install.iosSteps.split(
          ',',
        )[0]}
      </li>
      <li class="flex items-center gap-3">
        <PlusSquare size={20} class="text-brand" /> 2. {t.install.iosSteps.split(
          'then ',
        )[1]}
      </li>
    </ol>
  {:else if install.kind === 'ios-other'}
    <p class="text-sm text-text">{t.install.iosWrongBrowser}</p>
  {:else if install.kind === 'mac-safari'}
    <p class="flex items-center gap-3 text-sm text-text">
      <Menu size={20} class="text-brand" />
      {t.install.macSafari}
    </p>
  {/if}
</Sheet>
