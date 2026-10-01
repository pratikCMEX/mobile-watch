import fs from "fs";
import path from "path";

// ─── Locale loader ──────────────────────────────────────────────
// Locale files live in app/i18n/locales/<code>.json. The loader is lazy
// (one read per code) so a typo in an unused locale never breaks the
// server.

const LOCALES_DIR = path.join(__dirname, "locales");

export const SUPPORTED_LOCALES = ["en", "sq", "mk"];
export const DEFAULT_LOCALE = "en";

/**
 * The one header that selects the response language.
 *
 * Only `language` is consulted. `Accept-Language` is deliberately NOT
 * read: browsers send it automatically, so honouring it would make a
 * client that never asked for a translation silently receive one (and a
 * request with no `language` header would not reliably default to `en`).
 *
 * Node lowercases every incoming header name, so a client sending
 * `Language: sq` still lands on `headers.language`.
 */
const LANGUAGE_HEADER = "language";

/** Values interpolated into a template, e.g. ids, counts, error text. */
export type TranslationValues = Array<string | number | null | undefined>;

type Messages = Record<string, string>;

// code -> messages. Populated lazily, one read per locale code.
const cache = new Map<string, Messages>();

function readLocaleFile(code: string): Messages {
  const filePath = path.join(LOCALES_DIR, `${code}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err: any) {
    console.error(`[i18n] Failed to load locale "${code}": ${err.message}`);
    return {};
  }
}

function loadLocale(code: string): Messages {
  const cached = cache.get(code);
  if (cached) return cached;

  // Unknown codes fall back to English rather than throwing, so a bad
  // language header can never 500 the API.
  const safeCode = SUPPORTED_LOCALES.includes(code) ? code : DEFAULT_LOCALE;
  let messages = readLocaleFile(safeCode);

  // English is always the fallback for any key missing in another locale,
  // so a partially translated file can never produce a blank message.
  if (safeCode !== DEFAULT_LOCALE) {
    messages = { ...loadLocale(DEFAULT_LOCALE), ...messages };
  }

  cache.set(code, messages);
  return messages;
}

/**
 * Normalize a raw header value into one of the supported codes.
 * Anything missing, empty or unrecognised resolves to DEFAULT_LOCALE.
 */
export function normalizeLocale(raw?: string | null): string {
  if (!raw) return DEFAULT_LOCALE;
  const value = String(raw).trim();
  if (!value) return DEFAULT_LOCALE;
  // "sq-AL, sq;q=0.9, en;q=0.8" -> walk the candidates in priority order
  // and take the first one we actually support.
  const candidates = value
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .filter((p) => p.startsWith("q="))[0];
      return {
        tag: tag.trim().toLowerCase(),
        q: q ? parseFloat(q.slice(2)) : 1,
      };
    })
    .filter((c) => c.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const base = tag.split("-")[0];
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Resolve the locale for a request from its `language` header.
 *
 * No header, an empty header, or an unsupported code all resolve to
 * DEFAULT_LOCALE ("en"), so a client that does not care about language
 * simply gets English.
 */
export function localeFromRequest(req: any): string {
  const raw = req?.headers?.[LANGUAGE_HEADER];
  return normalizeLocale(Array.isArray(raw) ? raw[0] : raw);
}

/**
 * Substitute `${0}`, `${1}`, ... in a template with the supplied values.
 * Values are inserted verbatim — they are ids, imeis, counts and error
 * text, never markup. A missing value renders as an empty string rather
 * than leaking the raw placeholder to the client.
 */
function fill(template: string, values: TranslationValues): string {
  return template.replace(/\$\{(\d+)\}/g, (_match, idx) => {
    const v = values[Number(idx)];
    return v === undefined || v === null ? "" : String(v);
  });
}

// ─── Core translate ─────────────────────────────────────────────

/**
 * Translate a message key for a locale.
 *
 *   translate("en", "device_not_found")
 *     -> "Device not found"
 *   translate("sq", "devices_deleted_successfully", [3])
 *     -> "3 pajisje u fshin me sukses"
 *
 * The key is a stable snake_case identifier — never the English sentence —
 * so rewording the English or re-indenting a template literal in a
 * controller can never break a lookup.
 *
 * Resolution order:
 *   1. Exact key hit in the requested locale.
 *   2. English (loadLocale already merged it as the base layer).
 *   3. The key itself, so a missing translation degrades to something
 *      readable instead of an empty message.
 */
export function translate(
  locale: string,
  key: string,
  values?: TranslationValues
): string {
  if (typeof key !== "string" || key === "") return "";

  const code = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const template = loadLocale(code)[key];

  // Unknown key: returning it verbatim makes the gap obvious in the
  // response and in the logs, which is easier to act on than "".
  if (template === undefined) return key;

  // `values` is filled whenever it is supplied, including an empty array, so
  // a caller that passes no values gets blank slots rather than a literal
  // "${0}" leaking into the response body.
  return values ? fill(template, values) : template;
}

/**
 * Request-scoped translate. Reads the locale from the request headers and
 * falls back to the default. Prefers the value i18nMiddleware already
 * resolved so the header is only parsed once per request.
 *
 *   t(req, "device_not_found")
 *   t(req, "devices_deleted_successfully", [devices.length])
 */
export function t(req: any, key: string, values?: TranslationValues): string {
  const locale = req?.locale ?? localeFromRequest(req);
  return translate(locale, key, values);
}

/** Attach the resolved locale + a translate fn to the request object. */
export const i18nMiddleware = (req: any, res: any, next: any) => {
  const locale = localeFromRequest(req);
  req.locale = locale;
  req.t = (key: string, values?: TranslationValues) =>
    translate(locale, key, values);
  // Echo the resolved locale so clients can confirm what was served.
  if (typeof res?.setHeader === "function") {
    res.setHeader("Content-Language", locale);
  }
  next();
};

/**
 * Translate a key using the request attached to an Express response. This
 * is what the Response helpers use, so controllers pass a bare key and never
 * need to know about i18n.
 */
export function translateForResponse(res: any, key: string): string {
  const req = res?.req;
  if (req?.locale) return translate(req.locale, key);
  return translate(localeFromRequest(req), key);
}

export default {
  t,
  translate,
  translateForResponse,
  i18nMiddleware,
  normalizeLocale,
  localeFromRequest,
  loadLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
};
