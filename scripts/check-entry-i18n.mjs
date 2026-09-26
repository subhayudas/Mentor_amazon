// Gate for client/src/lib/i18n.ts (design G3): the entry chunk bundles only the English
// namespaces that its own modules use (Home, the header and footer, route guards, the banners,
// the not-found page and the libraries they import); every code-split page waits for the full
// file. A namespace used by an entry-chunk module but missing from that eager import renders raw
// keys on the first paint of those pages. This builds the client in memory, lists the entry
// chunk's modules, and fails when one of them references a top-level namespace the eager import
// leaves out.
//
//   npm run check:entry-i18n
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (file) => path.relative(root, file);
const en = JSON.parse(readFileSync(path.join(root, 'client/src/locales/en.json'), 'utf8'));
const namespaces = new Set(Object.keys(en));

const i18nSource = readFileSync(path.join(root, 'client/src/lib/i18n.ts'), 'utf8');
const eagerImport = i18nSource.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/locales\/en\.json['"]/);
if (!eagerImport) {
  console.error('check-entry-i18n: the eager `import { … } from "../locales/en.json"` is missing from client/src/lib/i18n.ts');
  process.exit(1);
}
const eager = new Set(eagerImport[1].split(',').map((name) => name.trim()).filter(Boolean));

let entryModules = [];
await build({
  root: path.join(root, 'client'),
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'silent',
  build: { write: false },
  plugins: [
    {
      name: 'entry-modules',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk' && chunk.isEntry) entryModules.push(...Object.keys(chunk.modules));
      },
    },
  ],
});

// Any string literal that starts with "<namespace>." counts as a use (t("nav.signIn"), `showcase.${x}`).
const keyReference = /["'`]([a-zA-Z][A-Za-z0-9]*)\.[A-Za-z0-9_${}]/g;
const used = new Map();
const sources = entryModules.filter((id) => id.includes('/client/src/') && /\.(tsx?|jsx?)$/.test(id));
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(keyReference)) {
    if (!namespaces.has(match[1])) continue;
    if (!used.has(match[1])) used.set(match[1], new Set());
    used.get(match[1]).add(rel(file));
  }
}

const missing = [...used.keys()].filter((ns) => !eager.has(ns)).sort();
const unused = [...eager].filter((ns) => !used.has(ns)).sort();
console.log(`check-entry-i18n: ${sources.length} entry-chunk modules use ${used.size} namespaces; ${eager.size} are bundled eagerly.`);
if (unused.length) console.log(`  bundled eagerly but unused by the entry chunk (could be dropped): ${unused.join(', ')}`);
if (missing.length) {
  console.error('check-entry-i18n: add these namespaces to the eager import in client/src/lib/i18n.ts:');
  for (const ns of missing) console.error(`  ${ns}: ${[...used.get(ns)].sort().join(', ')}`);
  process.exit(1);
}
console.log('check-entry-i18n: ok');
