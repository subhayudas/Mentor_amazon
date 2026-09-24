import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the SPA config roots Vite in
// client/ and loads browser plugins; these tests exercise the api/ functions
// and pure client modules under plain Node. The aliases mirror tsconfig.json
// so tests can import client modules that use `@/` and `@shared/`.
// Real-database suites live in tests/integration and run through
// vitest.integration.config.ts (`npm run test:integration`).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    restoreMocks: true,
  },
});
