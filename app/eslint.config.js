import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'public/',
      '../web/',
      'playwright-report/',
      'test-results/',
      'blob-report/',
      'dev-dist/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // A stray `any` must be justified in a comment above it (AGENTS.md).
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Build constants injected by vite.config.ts / vitest.config.ts.
    languageOptions: {
      globals: { __APP_VERSION__: 'readonly', __BUILD_TIME__: 'readonly' },
    },
  },
);
