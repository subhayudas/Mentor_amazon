import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Real-stack suites (local Supabase / scratch Postgres databases). Each suite
// skips itself unless SUPABASE_TEST_URL is set. Files run one at a time
// because they share one database.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    restoreMocks: true,
  },
});
