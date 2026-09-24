import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Look up the app's own strings (client/src/locales/*.json), so specs assert on what a
 * visitor reads in either language without hard-coding copy.
 */
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const cache = new Map<string, Record<string, unknown>>();

function bundle(lang: 'en' | 'ar'): Record<string, unknown> {
  let b = cache.get(lang);
  if (!b) {
    b = JSON.parse(readFileSync(path.join(ROOT, 'client', 'src', 'locales', `${lang}.json`), 'utf8')) as Record<string, unknown>;
    cache.set(lang, b);
  }
  return b;
}

/** The string at `key` (dotted path); `{{var}}` placeholders are left for the caller. */
export function tr(lang: 'en' | 'ar', key: string): string {
  let node: unknown = bundle(lang);
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) {
      throw new Error(`missing locale key ${lang}:${key}`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') throw new Error(`locale key ${lang}:${key} is not a string`);
  return node;
}

/** A regex that matches the string with its {{placeholders}} as wildcards. */
export function trPattern(lang: 'en' | 'ar', key: string): RegExp {
  const escaped = tr(lang, key)
    .split(/\{\{[^}]+\}\}/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(escaped);
}
