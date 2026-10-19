import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Projects inherit root options (arrays are concatenated), so `include` lives only in each project.
// `coverage` stays at the root: it is resolved once for the whole run, and the data unit's
// frozen test reads `config.test.coverage`.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['scripts/**/*.test.ts', 'src/**/*.test.{ts,tsx}', '**/*.d.ts'],
      thresholds: { lines: 80 },
    },
  },
})
