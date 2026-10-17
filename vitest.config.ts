import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts'],
      exclude: ['scripts/**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
})
