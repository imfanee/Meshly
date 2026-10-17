<script lang="ts">
  import { t } from '../i18n/en-GB';
  import { config } from '../../config';
  import { navigate } from '../router.svelte';

  function go(e: MouseEvent, path: string) {
    e.preventDefault();
    navigate(path);
  }
</script>

<footer
  class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-6
    text-center text-xs text-text-muted"
>
  <span>Meshly</span>
  <span aria-hidden="true">·</span>
  <span>{t.footer.product}</span>
  <span aria-hidden="true">·</span>
  <span>{t.footer.credit}</span>
  <span aria-hidden="true">·</span>
  <a
    href="https://github.com/imfanee"
    target="_blank"
    rel="noopener noreferrer"
    class="underline decoration-text-muted underline-offset-2 hover:text-text"
    >GitHub</a
  >
  <span aria-hidden="true">·</span>
  <a
    href="https://www.linkedin.com/in/faisal-hanif-ai-telecom/"
    target="_blank"
    rel="noopener noreferrer"
    class="underline decoration-text-muted underline-offset-2 hover:text-text"
    >LinkedIn</a
  >
  <span aria-hidden="true">·</span>
  <a
    href="/about"
    class="underline decoration-text-muted underline-offset-2 hover:text-text"
    onclick={(e) => go(e, '/about')}>{t.footer.about}</a
  >
  <span aria-hidden="true">·</span>
  <a
    href="/privacy"
    class="underline decoration-text-muted underline-offset-2 hover:text-text"
    onclick={(e) => go(e, '/privacy')}>{t.footer.privacy}</a
  >
  <span aria-hidden="true">·</span>
  <a
    href="/terms"
    class="underline decoration-text-muted underline-offset-2 hover:text-text"
    onclick={(e) => go(e, '/terms')}>{t.footer.terms}</a
  >
  <span aria-hidden="true">·</span>
  <span>v{config.version}</span>
</footer>
