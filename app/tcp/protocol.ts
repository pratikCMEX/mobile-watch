export interface ServerPortalCommand {
  deviceId: string;
  host: string;
  port: number;
  content: string;
  packet: string;
  length: number;
}

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4_PATTERN =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const BRACKETED_IPV6_PATTERN = /^\[([0-9A-Fa-f:]+)\]$/;
const URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/\S+$/;
const FORBIDDEN_HOST_PATTERN = /[\x00-\x1f\x7f*,[\]\\]/;

/**
 * Normalise a server address accepted by the watch firmware.
 *
 * The protocol accepts an IPv4 address, an IPv6 literal, a DNS name,
 * localhost, or an HTTP(S) URL. A URL is reduced to its hostname because
 * the wire payload already carries the port as a separate field.
 */
export function normalizeServerPortalHost(rawHost: string): string | null {
  if (typeof rawHost !== "string") return null;

  const value = rawHost.trim();
  if (!value || value.length > 253 || FORBIDDEN_HOST_PATTERN.test(value)) {
    return null;
  }

  if (URL_PATTERN.test(value)) {
    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      return null;
    }

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      (parsed.pathname !== "/" && parsed.pathname !== "")
    ) {
      return null;
    }

    if (!parsed.hostname) return null;

    // URL.hostname retains brackets around an IPv6 literal.
    return normalizeServerPortalHost(parsed.hostname.replace(/^\[|\]$/g, ""));
  }

  const bracketedIpv6 = value.match(BRACKETED_IPV6_PATTERN);
  if (bracketedIpv6) {
    return normalizeServerPortalHost(bracketedIpv6[1]);
  }

  if (IPV4_PATTERN.test(value)) {
    return value;
  }

  if (value.includes(":")) {
    // Keep IPv6 literals usable without allowing protocol delimiters.
    const ipv6Pattern = /^[0-9A-Fa-f:]+$/;
    return ipv6Pattern.test(value) && value.split(":").length <= 8
      ? value
      : null;
  }

  if (value === "localhost" || HOSTNAME_PATTERN.test(value)) {
    return value.toLowerCase();
  }

  return null;
}

/**
 * Build the vendor protocol command used to change the reporting server.
 *
 * Example:
 *   [3G*8800000015*0014*IP,113.81.229.9,5900]
 *
 * LEN is the UTF-8 byte length of the content after the third asterisk.
 */
export function buildServerPortalCommand(
  deviceId: string,
  rawHost: string,
  port: number
): ServerPortalCommand | null {
  if (!DEVICE_ID_PATTERN.test(deviceId)) return null;

  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }

  const host = normalizeServerPortalHost(rawHost);
  if (!host) return null;

  const content = `IP,${host},${portNumber}`;
  const length = Buffer.byteLength(content, "utf8");
  if (length > 0xffff) return null;

  const lengthHex = length.toString(16).padStart(4, "0");
  const packet = `[3G*${deviceId}*${lengthHex}*${content}]`;

  return {
    deviceId,
    host,
    port: portNumber,
    content,
    packet,
    length,
  };
}
