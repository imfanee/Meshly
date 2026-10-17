import { defineConfig, devices } from '@playwright/test';

/**
 * E2E setup per docs/10-TESTING.md section 2.
 *
 * The web server builds the app then serves it with `vite preview`, so tests
 * always run against production output. The dev relay (tools/dev-relay.mjs)
 * joins this config in task T1.4.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Dev relay on :8787 and a small room cap make e2e hermetic.
      command:
        'VITE_DEV_RELAY_URL=ws://localhost:8787 VITE_MAX_PARTICIPANTS=3 npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'node tools/dev-relay.mjs',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--auto-select-desktop-capture-source=Entire screen',
          ],
        },
      },
    },
  ],
});
