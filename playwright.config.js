// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 2,
  // O app carrega React + fontes de CDNs externos; com muitos workers em paralelo
  // a CDN congestiona e o page.goto estoura. 2 workers mantêm o gate estável.
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'tests/report', open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 60_000, // tolera CDN lenta no carregamento da página
    actionTimeout: 15_000,
  },

  // Serve the app before running tests
  webServer: {
    command: 'node serve-app.js',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 5'] }, // mobile viewport matching the app design
    },
  ],
});
