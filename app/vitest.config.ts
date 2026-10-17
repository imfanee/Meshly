import { defineConfig } from 'vitest/config';

// Separate config so unit tests never load the PWA or Svelte plugins;
// core/ modules are framework-free TypeScript (doc 10 section 1).
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_TIME__: JSON.stringify('test'),
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
