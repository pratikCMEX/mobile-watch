/**
 * Finds response-helper calls whose message argument is NOT a plain literal
 * or a key — i.e. a ternary, a variable, or a concatenation the earlier
 * codemod could not rewrite. These are the remaining un-localized messages.
 *
 *   successMessage(res, flag ? "A" : "B")        <-- ternary
 *   successMessage(res, someVariable)             <-- variable
 *
 * Usage: node app/i18n/_find_dynamic.js
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
const KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

const isId = (c) => /[A-Za-z0-9_$]/.test(c);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const hits = [];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");

  for (let i = 0; i < src.length; i++) {
    if (!isId(src[i])) continue;
    const helper = HELPERS.find((h) => src.startsWith(h, i));
    if (!helper) continue;
    if (i > 0 && isId(src[i - 1])) continue;

    let j = i + helper.length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== "(") continue;
    j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (!src.startsWith("res", j)) continue;
    j += 3;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== ",") continue;
    j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (/[0-9]/.test(src[j])) {
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== ",") continue;
      j++;
    }
    while (j < src.length && /\s/.test(src[j])) j++;

    // Walk ONLY the first argument, stopping at the top-level comma that
    // separates it from resData — otherwise trailing arguments get reported
    // as if they were the message.
    let depth = 0;
    let k = j;
    let steps = 0;
    while (k < src.length && steps++ < 4000) {
      const c = src[k];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) break;
      else if (c === ";" && depth === 0) break;
      else if (c === '"' || c === "'" || c === "`") {
        const q = c;
        k++;
        while (k < src.length && src[k] !== q) {
          if (src[k] === "\\") k++;
          k++;
        }
      }
      k++;
    }

    const expr = src.slice(j, k).trim().replace(/\s+/g, " ");
    if (!expr) continue;

    // Already localized: a quoted key, or t(req, "key", ...).
    const quoted = /^"([a-z][a-z0-9]*(?:_[a-z0-9]+)*)"$/.exec(expr);
    if (quoted) continue;
    if (/^t\(\s*\w+\s*,\s*"[a-z0-9_]+"/.test(expr)) continue;
    // A bare variable is a different problem (not a message we can key),
    // reported separately below.
    const isBareVar = /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(expr);

    const line = src.slice(0, j).split("\n").length;
    hits.push({
      file: path.relative(ROOT, file),
      line,
      helper,
      kind: isBareVar ? "variable" : "dynamic",
      expr: expr.length > 150 ? expr.slice(0, 150) + " ..." : expr,
    });
  }
}

const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}

const vars = hits.filter((h) => h.kind === "variable");
const dyn = hits.filter((h) => h.kind === "dynamic");

console.error(
  `[dynamic] ${dyn.length} dynamic + ${vars.length} variable message args ` +
    `in ${byFile.size} files\n`
);
for (const [file, list] of byFile) {
  console.error("== " + file);
  for (const h of list) {
    console.error(`  L${h.line}  ${h.helper}  [${h.kind}]`);
    console.error(`      ${h.expr}`);
  }
}
