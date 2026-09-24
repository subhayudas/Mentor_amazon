import { execFileSync } from 'node:child_process';
import { E2E_PROJECTS } from './fixtures/personas';

/**
 * Reset the personas of the projects about to run (scripts/e2e/seed.ts) so every run starts
 * from the seeded state. E2E_SKIP_SEED=1 skips it (e.g. while iterating on one spec).
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_SEED === '1') return;
  const selected = process.argv.flatMap((arg, i, all) =>
    arg.startsWith('--project=') ? [arg.slice('--project='.length)] : arg === '--project' && all[i + 1] ? [all[i + 1]] : [],
  );
  const matches = (name: string) =>
    selected.length === 0 || selected.some((p) => p === name || (p.includes('*') && new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(name)));
  const projects = E2E_PROJECTS.filter(matches);
  if (projects.length === 0) return;
  execFileSync('npx', ['tsx', 'scripts/e2e/seed.ts', ...projects], { stdio: ['ignore', 2, 2], env: process.env });
}
