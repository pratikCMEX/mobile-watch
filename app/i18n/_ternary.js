/**
 * Second codemod pass: response-helper calls whose message is a TERNARY of two
 * string literals. The first codemod only rewrote a lone literal, so these
 * were left as raw English:
 *
 *   successMessage(res, enabled ? "A" : "B", data)
 *
 * becomes a localized branch:
 *
 *   successMessage(res, t(req, enabled ? "key_a" : "key_b"), data)
 *
 * Each branch needs its own key because they are genuinely different
 * sentences. Emits the key map to _ternary_keys.json for review.
 *
 * Usage: node app/i18n/_ternary.js [--write]
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const ROOT = path.join(HERE, "..");
const HELPERS = [
  "successMessage",
  "errorMessage",
  "waitMessage",
  "successPagination",
  "customMessage",
];
const SKIP = new Set(["i18n", "node_modules", "migrations", "seeders"]);

const isId = (c) => /[A-Za-z0-9_$]/.test(c);

/** Read a plain quoted string (no interpolation) at i, else null. */
function readPlainQuoted(src, i) {
  const q = src[i];
  if (q !== '"' && q !== "'") return null;
  let raw = "";
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") {
      raw += src[j] + (src[j + 1] ?? "");
      j += 2;
      continue;
    }
    if (src[j] === q) return { raw, next: j + 1 };
    raw += src[j];
    j++;
  }
  return null;
}

function skipSpace(src, i) {
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

/** Stable snake_case key from an English sentence. */
function deriveKey(sentence) {
  const key = sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^\d/.test(key) ? "msg_" + key : key || "message";
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const edits = [];
const keys = new Map();
const skipped = [];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");

  for (let i = 0; i < src.length; i++) {
    if (!isId(src[i])) continue;
    const helper = HELPERS.find((h) => src.startsWith(h, i));
    if (!helper) continue;
    if (i > 0 && isId(src[i - 1])) continue;

    let j = i + helper.length;
    j = skipSpace(src, j);
    if (src[j] !== "(") continue;
    j = skipSpace(src, j + 1);
    if (!src.startsWith("res", j)) continue;
    j = skipSpace(src, j + 3);
    if (src[j] !== ",") continue;
    j = skipSpace(src, j + 1);
    if (/[0-9]/.test(src[j])) {
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      j = skipSpace(src, j);
      if (src[j] !== ",") continue;
      j = skipSpace(src, j + 1);
    }

    const start = j;

    // The message must be `COND ? "A" : "B"`. Scan for the `?` that is not
    // inside a string and sits at depth 0 of the argument.
    let depth = 0;
    let k = j;
    let qpos = -1;
    let steps = 0;
    while (k < src.length && steps++ < 2000) {
      const c = src[k];
      if (c === '"' || c === "'" || c === "`") {
        const q = c;
        k++;
        while (k < src.length && src[k] !== q) {
          if (src[k] === "\\") k++;
          k++;
        }
        k++;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if (c === "?" && depth === 0) {
        qpos = k;
        break;
      } else if ((c === ";" || c === ",") && depth === 0) break;
      k++;
    }
    if (qpos === -1) continue;

    const cond = src.slice(start, qpos).trim();
    // A real condition, not e.g. `a ?? b`.
    if (!cond || cond.includes("?") || cond.includes(": ")) continue;

    const consequent = readPlainQuoted(src, skipSpace(src, qpos + 1));
    if (!consequent) continue;

    let p = skipSpace(src, consequent.next);
    if (src[p] !== ":") continue;
    p = skipSpace(src, p + 1);

    const alternate = readPlainQuoted(src, p);
    if (!alternate) continue;

    const end = alternate.next;

    const a = deriveKey(consequent.raw);
    const b = deriveKey(alternate.raw);
    keys.set(a, consequent.raw);
    keys.set(b, alternate.raw);

    const line = src.slice(0, start).split("\n").length;
    edits.push({
      file,
      start,
      end,
      replacement: `t(req, ${cond} ? "${a}" : "${b}")`,
      line,
      cond,
      a: consequent.raw,
      b: alternate.raw,
    });
    i = end;
  }
}

console.error(
  `[ternary] ${edits.length} ternary message arguments, ` +
    `${keys.size} keys, ${skipped.length} skipped`
);
for (const e of edits) {
  console.error(
    `  ${path.relative(ROOT, e.file)}:${e.line}\n` +
      `      cond: ${e.cond}\n` +
      `      A -> ${e.a}\n` +
      `      B -> ${e.b}`
  );
}

fs.writeFileSync(
  path.join(HERE, "_ternary_keys.json"),
  JSON.stringify(Object.fromEntries([...keys].sort()), null, 2) + "\n"
);

if (!process.argv.includes("--write")) {
  console.error("[ternary] dry run — pass --write to apply");
  process.exit(0);
}

const byFile = new Map();
for (const e of edits) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

for (const [file, list] of byFile) {
  let src = fs.readFileSync(file, "utf8");
  for (const e of [...list].sort((a, b) => b.start - a.start)) {
    src = src.slice(0, e.start) + e.replacement + src.slice(e.end);
  }
  fs.writeFileSync(file, src);
}

console.error(
  `[ternary] rewrote ${edits.length} call sites in ${byFile.size} files`
);
