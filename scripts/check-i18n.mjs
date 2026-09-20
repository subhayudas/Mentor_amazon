#!/usr/bin/env node
/**
 * Locale parity + usage check (no dependencies).
 *
 *   node scripts/check-i18n.mjs
 *
 * 1. Flattens client/src/locales/en.json and ar.json and fails if any key is
 *    present on one side only.
 * 2. Warns when an EN value is identical to its AR value (untranslated),
 *    except allow-listed placeholders such as e-mail examples.
 * 3. Scans client/src for literal t('...') / t("...") / t(`...`) keys and fails
 *    if a key is not defined in en.json. Template literals with ${...} are
 *    dynamic; only their static prefix is checked (warning, not failure).
 *
 * Exit code 1 on any parity failure or missing key, 0 otherwise.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EN_PATH = join(root, "client", "src", "locales", "en.json");
const AR_PATH = join(root, "client", "src", "locales", "ar.json");
const SRC_DIR = join(root, "client", "src");

/** Keys whose EN and AR values may legitimately be identical. */
const IDENTICAL_ALLOW = [/(^|\.)emailPlaceholder$/i];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** i18next plural / context suffixes that resolve a bare key. */
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other", "_plural"];

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`x  Cannot parse ${relative(root, path)}: ${err.message}`);
    process.exit(1);
  }
}

function flatten(node, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "locales") continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      yield full;
    }
  }
}

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

// ---------------------------------------------------------------- parity ---
const en = flatten(loadJson(EN_PATH));
const ar = flatten(loadJson(AR_PATH));

const missingInAr = [...en.keys()].filter((k) => !ar.has(k));
const missingInEn = [...ar.keys()].filter((k) => !en.has(k));
const emptyValues = [];
for (const [k, v] of en) if (typeof v !== "string" || v.trim() === "") emptyValues.push(`en:${k}`);
for (const [k, v] of ar) if (typeof v !== "string" || v.trim() === "") emptyValues.push(`ar:${k}`);

const identical = [];
for (const [k, v] of en) {
  if (!ar.has(k) || ar.get(k) !== v) continue;
  if (IDENTICAL_ALLOW.some((re) => re.test(k))) continue;
  if (typeof v === "string" && EMAIL_RE.test(v.trim())) continue;
  identical.push(k);
}

// ----------------------------------------------------------------- usage ---
const keyExists = (key) => {
  if (en.has(key)) return true;
  if (PLURAL_SUFFIXES.some((s) => en.has(key + s))) return true;
  // Object node (returnObjects) — a parent of at least one leaf.
  const parent = key + ".";
  for (const k of en.keys()) if (k.startsWith(parent)) return true;
  return false;
};
const prefixExists = (prefix) => {
  if (!prefix) return true;
  const p = prefix.endsWith(".") ? prefix : prefix + ".";
  for (const k of en.keys()) if (k.startsWith(p) || k === prefix) return true;
  return false;
};

// t('key'), t("key"), t(`key`), also i18n.t(...). The first argument only.
const LITERAL_RE = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const TEMPLATE_RE = /\bt\(\s*`((?:\\.|[^`\\])*)`/g;

const missingKeys = []; // { file, line, key }
const dynamicUnknown = []; // { file, line, prefix }
let literalCount = 0;
let dynamicCount = 0;

for (const file of walk(SRC_DIR)) {
  const source = readFileSync(file, "utf8");
  const rel = relative(root, file);

  for (const match of source.matchAll(LITERAL_RE)) {
    const key = match[2];
    literalCount++;
    if (!keyExists(key)) missingKeys.push({ file: rel, line: lineOf(source, match.index), key });
  }
  for (const match of source.matchAll(TEMPLATE_RE)) {
    const raw = match[1];
    const dollar = raw.indexOf("${");
    if (dollar === -1) {
      literalCount++;
      if (!keyExists(raw)) missingKeys.push({ file: rel, line: lineOf(source, match.index), key: raw });
      continue;
    }
    dynamicCount++;
    const prefix = raw.slice(0, dollar).replace(/\.$/, "");
    if (!prefixExists(prefix)) dynamicUnknown.push({ file: rel, line: lineOf(source, match.index), prefix });
  }
}

// ---------------------------------------------------------------- report ---
let failed = false;
const list = (items) => items.map((x) => `     - ${x}`).join("\n");

console.log(`i18n check: en=${en.size} keys, ar=${ar.size} keys, ${literalCount} literal t() keys, ${dynamicCount} dynamic t() keys`);

if (missingInAr.length) {
  failed = true;
  console.error(`x  ${missingInAr.length} key(s) in en.json missing from ar.json:\n${list(missingInAr)}`);
}
if (missingInEn.length) {
  failed = true;
  console.error(`x  ${missingInEn.length} key(s) in ar.json missing from en.json:\n${list(missingInEn)}`);
}
if (emptyValues.length) {
  failed = true;
  console.error(`x  ${emptyValues.length} empty or non-string value(s):\n${list(emptyValues)}`);
}
if (identical.length) {
  console.warn(`!  ${identical.length} key(s) have identical EN and AR values (untranslated?):\n${list(identical)}`);
}
if (dynamicUnknown.length) {
  console.warn(
    `!  ${dynamicUnknown.length} dynamic t() key(s) whose static prefix matches nothing in en.json:\n${list(
      dynamicUnknown.map((d) => `${d.file}:${d.line}  ${d.prefix}.*`),
    )}`,
  );
}
if (missingKeys.length) {
  failed = true;
  console.error(
    `x  ${missingKeys.length} literal t() key(s) not defined in en.json:\n${list(
      missingKeys.map((m) => `${m.file}:${m.line}  ${m.key}`),
    )}`,
  );
}

if (failed) {
  console.error("i18n check failed.");
  process.exit(1);
}
console.log("i18n check passed.");
