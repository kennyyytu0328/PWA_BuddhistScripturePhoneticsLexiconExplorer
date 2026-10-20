import { defineConfig, devices } from '@playwright/test'

// Reader acceptance tests run against the production build (`pnpm build` first, REQ-RDR-027).
// Service workers are blocked here; the `pwa` unit's tests opt in with test.use({ serviceWorkers: 'allow' }).
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'pixel-7', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
