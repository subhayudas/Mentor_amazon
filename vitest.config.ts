import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the SPA config roots Vite in
// client/ and loads browser plugins; these tests exercise the api/ functions
// under plain Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
