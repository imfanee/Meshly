<script lang="ts">
  import { t } from '../lib/i18n/en-GB';
  import Button from '../lib/ui/Button.svelte';
  import Footer from '../lib/ui/Footer.svelte';
  import { navigate } from '../lib/router.svelte';
</script>

<svelte:head>
  <title>{t.errors.notFound} · Meshly</title>
</svelte:head>

<div
  class="mx-auto flex min-h-dvh max-w-md flex-col items-center
    justify-center gap-4 px-4 text-center"
>
  <h1 class="text-2xl font-semibold">{t.errors.notFound}</h1>
  <Button variant="secondary" onclick={() => navigate('/')}>
    {t.errors.backHome}
  </Button>
  <Footer />
</div>
