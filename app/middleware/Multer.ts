const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Absolute base path so the uploads dir works regardless of CWD ──
const UPLOAD_BASE = path.resolve(__dirname, "..", "..", "uploads");

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Make sure the base directory exists at startup
ensureDir(UPLOAD_BASE);

const profile = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const dir = path.join(UPLOAD_BASE, "profile");
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const random = crypto.randomBytes(6).toString("hex");
    cb(null, `${Date.now()}_${random}_profile${ext}`);
  },
});

// NOTE: Folder name is `snapshots` (plural) to match the public URL
// built in Snapshot_controller and served by the static handler in app.ts.
const snapshot = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const dir = path.join(UPLOAD_BASE, "snapshots");
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const random = crypto.randomBytes(6).toString("hex");
    cb(null, `${Date.now()}_${random}_snapshot${ext}`);
  },
});

// ── File filters (only allow images) ──────────────────────────────
const imageOnlyFilter = (req: any, file: any, cb: any) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    return cb(null, true);
  }
  return cb(new Error("Only image files (jpeg, jpg, png, webp) are allowed"));
};

const uploadProfile = multer({
  storage: profile,
  fileFilter: imageOnlyFilter,
  // limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const uploadSnapshot = multer({
  storage: snapshot,
  fileFilter: imageOnlyFilter,
  // limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── Voice message upload (AMR audio) ──────────────────────────────
const voice = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const dir = path.join(UPLOAD_BASE, "voice");
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".amr";
    const random = crypto.randomBytes(6).toString("hex");
    cb(null, `${Date.now()}_${random}_voice${ext}`);
  },
});

const audioOnlyFilter = (req: any, file: any, cb: any) => {
  // The server transcodes whatever it receives to AMR-NB before
  // sending it to the watch (see AudioConverter.ensureAmrNarrowband),
  // so any real audio format is acceptable here — this filter only
  // exists to reject obviously-wrong uploads (images, PDFs, etc).
  // iOS records .m4a (AAC) by default, hence the extra extensions/
  // mimetypes beyond plain AMR.
  const allowedMimetypes = [
    "audio/amr",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/3gpp",
    "application/octet-stream",
  ];
  const allowedExtensions = [
    ".amr",
    ".m4a",
    ".mp3",
    ".mp4",
    ".aac",
    ".wav",
    ".3gp",
    ".caf",
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimetypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    return cb(null, true);
  }
  return cb(new Error("Only AMR/audio files are allowed"));
};

const uploadVoice = multer({
  storage: voice,
  fileFilter: audioOnlyFilter,
  // limits: { fileSize: 64 * 1024 }, // 64 KB max (≈15 seconds of AMR)
});

export { uploadProfile, uploadSnapshot, uploadVoice };
