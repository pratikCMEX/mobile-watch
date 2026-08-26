const multer = require("multer");
const fs = require("fs");
const path = require("path");
const profile = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const dir = "./uploads/profile/";
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "_profile" + ext);
  },
});

const snapshot = multer.diskStorage({
  destination: (req: Request, file: any, cb: any) => {
    const dir = "./uploads/snapshot/";
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req: Request, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "_snapshot" + ext);
  },
});

const uploadProfile = multer({ storage: profile });
const uploadSnapshot = multer({ storage: snapshot });

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export { uploadProfile, uploadSnapshot };
