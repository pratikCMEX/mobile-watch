import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import Logging from "./Logging";

// ─────────────────────────────────────────────────────────────
// Ensure watch-bound voice audio is narrowband AMR.
//
// The watch firmware only understands raw AMR-NB frames (no file
// header) per the TK / TAKEPILLS protocol. iOS clients record and
// upload .m4a (AAC) instead of .amr, which — sent as-is — the watch
// cannot play at all. Rather than trust the client's file extension
// (which can be wrong or missing), we sniff the actual file magic:
// if it's already narrowband AMR we just strip the header and use
// it directly (no re-encode, no quality loss); anything else (m4a,
// mp3, wav, wideband AMR, ...) is transcoded via ffmpeg.
// ─────────────────────────────────────────────────────────────

const AMR_NB_MAGIC = Buffer.from("#!AMR\n");

const isAmrNarrowband = (buf: Buffer): boolean =>
  buf.length >= AMR_NB_MAGIC.length &&
  buf.subarray(0, AMR_NB_MAGIC.length).equals(AMR_NB_MAGIC);

/**
 * Returns raw, header-stripped AMR-NB frame bytes ready to send to
 * the watch over TK/TAKEPILLS. Converts via ffmpeg (libopencore_amrnb,
 * 8kHz mono, 12.2kbps — the highest AMR-NB mode) if the input isn't
 * already narrowband AMR.
 *
 * Throws if ffmpeg is missing/fails or the input can't be decoded —
 * callers should surface that as an error rather than send bad audio
 * to the device.
 */
export async function ensureAmrNarrowband(filePath: string): Promise<Buffer> {
  const original = fs.readFileSync(filePath);

  if (isAmrNarrowband(original)) {
    Logging.info(
      `[AudioConverter] "${path.basename(
        filePath
      )}" is already narrowband AMR (${original.length} bytes) — no conversion needed.`
    );
    return original.subarray(AMR_NB_MAGIC.length);
  }

  Logging.info(
    `[AudioConverter] "${path.basename(filePath)}" is not narrowband AMR ` +
      `(first bytes: ${original
        .subarray(0, 16)
        .toString("hex")}) — converting via ffmpeg.`
  );

  const outputPath = `${filePath}.converted.amr`;

  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-y",
        "-i",
        filePath,
        "-ar",
        "8000",
        "-ac",
        "1",
        "-c:a",
        "libopencore_amrnb",
        "-b:a",
        "12200",
        outputPath,
      ],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `ffmpeg AMR-NB conversion failed: ${err.message}\n${stderr}`
            )
          );
          return;
        }
        resolve();
      }
    );
  });

  let converted: Buffer;
  try {
    converted = fs.readFileSync(outputPath);
  } finally {
    fs.unlink(outputPath, () => {
      // best-effort cleanup of the intermediate file
    });
  }

  if (!isAmrNarrowband(converted)) {
    throw new Error(
      "ffmpeg produced output that is not valid AMR-NB (missing #!AMR header)"
    );
  }

  Logging.info(
    `[AudioConverter] Converted "${path.basename(filePath)}" -> AMR-NB ` +
      `(${converted.length} bytes)`
  );

  return converted.subarray(AMR_NB_MAGIC.length);
}
