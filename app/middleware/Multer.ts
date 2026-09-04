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

export { uploadProfile, uploadSnapshot };
