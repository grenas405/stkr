import { defineConfig, devices } from '@playwright/test';

const PORT = 8799;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    permissions: ['geolocation'],
    geolocation: { latitude: 35.6762, longitude: 139.6503 },
    acceptDownloads: true,
    // Each test starts clean, and the service worker must not hide network requests.
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx wrangler dev --port ${PORT} --log-level warn`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
