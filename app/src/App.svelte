<script lang="ts">
  import { t } from './lib/i18n/en-GB';
  import { config } from './config';
</script>

<svelte:head>
  <title>{t.appName} · {t.tagline}</title>
</svelte:head>

<main class="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
  <img src="/icons/logo.svg" alt="" width="72" height="72" />
  <div class="text-center">
    <h1 class="text-3xl font-semibold tracking-tight">
      {t.appName}
    </h1>
    <p class="mt-2 text-lg text-text-muted">{t.tagline} {t.heroSub}</p>
    <p class="mt-4 text-sm text-text-muted">{t.scaffoldNotice}</p>
  </div>
</main>

<footer
  class="fixed inset-x-0 bottom-0 p-4 text-center text-xs text-text-muted"
>
  Meshly · {t.footer.product} ·
  {t.footer.credit} ·
  <a
    href="https://github.com/imfanee"
    target="_blank"
    rel="noopener noreferrer"
    class="underline">GitHub</a
  >
  ·
  <a
    href="https://www.linkedin.com/in/faisal-hanif-ai-telecom/"
    target="_blank"
    rel="noopener noreferrer"
    class="underline">LinkedIn</a
  >
  · v{config.version}
</footer>
