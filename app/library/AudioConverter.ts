import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import Logging from "./Logging";

// ─────────────────────────────────────────────────────────────
// Ensure watch-bound voice audio is narrowband AMR.
//
// iOS clients record and upload .m4a (AAC) instead of .amr, which —
// sent as-is — the watch cannot play at all. Rather than trust the
// client's file extension (which can be wrong or missing), we sniff
// the actual file magic: if it's already narrowband AMR we use it
// directly, header and all (no re-encode, no quality loss, and
// matching exactly how genuine AMR uploads were sent before this
// module existed — sending the raw file bytes unmodified); anything
// else (m4a, mp3, wav, wideband AMR, 3GP-wrapped AMR, ...) is
// transcoded via ffmpeg, whose own output already includes the same
// "#!AMR\n" header, kept for the same reason.
// ─────────────────────────────────────────────────────────────

const AMR_NB_MAGIC = Buffer.from("#!AMR\n");

const isAmrNarrowband = (buf: Buffer): boolean =>
  buf.length >= AMR_NB_MAGIC.length &&
  buf.subarray(0, AMR_NB_MAGIC.length).equals(AMR_NB_MAGIC);

/**
 * Returns a complete narrowband-AMR file buffer (magic header
 * included) ready to send to the watch, matching exactly how genuine
 * AMR uploads were transmitted before this module existed. Converts
 * via ffmpeg (libopencore_amrnb, 8kHz mono) if the input isn't
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
    return original;
  }

  Logging.info(
    `[AudioConverter] "${path.basename(filePath)}" is not narrowband AMR ` +
      `(first bytes: ${original
        .subarray(0, 16)
        .toString("hex")}) — converting via ffmpeg.`
  );

  // Persist the converted file permanently as a real ".amr" file next
  // to the original upload, instead of a throwaway temp file — so
  // what's on disk actually reflects what was sent to the device.
  //
  // Always append ".amr" to the FULL original filename (extension
  // included) rather than replacing the extension — some Android
  // uploads already arrive named "*.amr" while actually being a 3GP/
  // MP4 container wrapping an AMR stream (not the bare "#!AMR\n"
  // format), which still needs conversion. Replacing the extension in
  // that case would make the output path equal the input path, and
  // ffmpeg refuses to edit a file in place ("Output same as Input").
  // Appending guarantees the output path can never collide.
  const outputPath = `${filePath}.amr`;

  // AMR-NB mode: watch firmware confirmed working with genuine
  // Android-recorded AMR, but our ffmpeg/libopencore_amrnb output at
  // MR122 (12.2kbps, the highest mode) played silent on the same
  // device despite being structurally valid and byte-verified — a
  // narrower firmware decoder is the likely explanation, so trying
  // MR74 (7.4kbps), a widely-supported "safe" AMR-NB mode.
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
        "7400",
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

  const converted = fs.readFileSync(outputPath);

  if (!isAmrNarrowband(converted)) {
    throw new Error(
      "ffmpeg produced output that is not valid AMR-NB (missing #!AMR header)"
    );
  }

  Logging.info(
    `[AudioConverter] Converted "${path.basename(filePath)}" -> ` +
      `"${path.basename(outputPath)}" (${converted.length} bytes)`
  );

  return converted;
}
