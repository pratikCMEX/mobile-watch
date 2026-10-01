/**
 * Validator for the locale files. Run after adding or changing a key:
 *
 *   node app/i18n/_extract.js
 *
 * Checks, in order of importance:
 *   1. Every locale has exactly the same key set.
 *   2. Every key is a valid snake_case identifier — a key with a space in it
 *      can be broken by a stray edit, which is the whole reason the English
 *      sentence is no longer used as the key.
 *   3. Every `${n}` placeholder in a translation exists in the English value,
 *      so no runtime value can silently disappear.
 *   4. Every key used by a response helper or a t(req, ...) call actually
 *      exists in en.json, so a typo surfaces here rather than in production.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const LOCALES = path.join(HERE, "locales");
const codes = ["en", "sq", "mk"];

const problems = [];
const fail = (m) => problems.push(m);

// ─── 1/2/3: key shape and placeholders ─────────────────────────
const dicts = {};
for (const code of codes) {
  const file = path.join(LOCALES, `${code}.json`);
  if (!fs.existsSync(file)) {
    fail(`missing locale file: ${code}.json`);
    continue;
  }
  try {
    dicts[code] = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${code}.json is not valid JSON: ${err.message}`);
  }
}

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const slots = (s) =>
  [
    ...new Set(
      [...String(s).matchAll(/\$\{(\d+)\}/g)].map((m) => Number(m[1]))
    ),
  ].sort((a, b) => a - b);

if (dicts.en) {
  const enKeys = Object.keys(dicts.en);

  for (const key of enKeys) {
    if (!SNAKE.test(key)) {
      fail(`en.json key is not snake_case: ${JSON.stringify(key)}`);
    }
    // A sentence slipped in as a key defeats the purpose of the migration.
    if (/\s/.test(key)) {
      fail(`en.json key contains whitespace: ${JSON.stringify(key)}`);
    }
  }

  for (const code of codes) {
    if (code === "en" || !dicts[code]) continue;
    const keys = Object.keys(dicts[code]);

    for (const key of enKeys) {
      if (!(key in dicts[code])) fail(`${code}.json missing key: ${key}`);
    }
    for (const key of keys) {
      if (!(key in dicts.en)) fail(`${code}.json has unknown key: ${key}`);
    }

    for (const key of keys) {
      if (!(key in dicts.en)) continue;
      const want = slots(dicts.en[key]).join(",");
      const got = slots(dicts[code][key]).join(",");
      if (want !== got) {
        fail(
          `${code}.json placeholder mismatch for ${key}: ` +
            `en has [${want}], ${code} has [${got}]`
        );
      }
    }
  }

  // ─── 4: keys referenced by the code ──────────────────────────
  const referenced = new Map(); // key -> [file:line]
  const HELPERS = [
    "successMessage",
    "errorMessage",
    "waitMessage",
    "successPagination",
    "customMessage",
  ];
  const SKIP = new Set(["node_modules", "migrations", "seeders"]);

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.name.endsWith(".ts")) continue;
      if (path.dirname(full) === HERE) continue; // this script + siblings

      const src = fs.readFileSync(full, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        // t(req, "key", ...) — the interpolated form.
        for (const m of line.matchAll(/\bt\(\s*\w+\s*,\s*"([^"]+)"/g)) {
          if (!referenced.has(m[1])) referenced.set(m[1], []);
          referenced.get(m[1]).push(`${path.relative(ROOT, full)}:${i + 1}`);
        }
        // helper(res, "key") — the plain form.
        for (const h of HELPERS) {
          const re = new RegExp(
            `\\b${h}\\(\\s*res\\s*,\\s*(?:\\d+\\s*,\\s*)?"([^"]+)"`,
            "g"
          );
          for (const m of line.matchAll(re)) {
            if (!referenced.has(m[1])) referenced.set(m[1], []);
            referenced.get(m[1]).push(`${path.relative(ROOT, full)}:${i + 1}`);
          }
        }
      });
    }
  };
  walk(ROOT);

  for (const [key, sites] of referenced) {
    if (!(key in dicts.en)) {
      fail(`code references unknown key ${JSON.stringify(key)} (${sites[0]})`);
    }
  }

  // ─── 5: English keys nothing references ───────────────────────
  // app.ts registers its own messages outside a response helper, so the
  // unused report is informational rather than an error.
  const unused = enKeys.filter((k) => !referenced.has(k));

  console.log(`[i18n] ${codes.length} locales, ${enKeys.length} keys each`);
  console.log(`[i18n] ${referenced.size} keys referenced from code`);
  console.log(`[i18n] ${unused.length} keys not referenced by a helper call`);
  if (unused.length) {
    console.log("[i18n] unused: " + unused.slice(0, 12).join(", "));
    if (unused.length > 12)
      console.log(`[i18n] ... +${unused.length - 12} more`);
  }
}

if (problems.length) {
  console.error(`\n[i18n] ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  if (problems.length > 40)
    console.error(`  ... +${problems.length - 40} more`);
  process.exit(1);
}

console.log("[i18n] OK");
