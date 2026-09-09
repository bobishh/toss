import { defineConfig, devices } from '@playwright/test';

const port = process.env.TOSS_E2E_PORT ?? '4243';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `PORT=${port} npm run serve`,
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
