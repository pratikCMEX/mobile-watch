"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSnapshot = exports.uploadProfile = void 0;
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const profile = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = "./uploads/profile/";
        ensureDir(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + "_profile" + ext);
    },
});
const snapshot = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = "./uploads/snapshot/";
        ensureDir(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + "_snapshot" + ext);
    },
});
const uploadProfile = multer({ storage: profile });
exports.uploadProfile = uploadProfile;
const uploadSnapshot = multer({ storage: snapshot });
exports.uploadSnapshot = uploadSnapshot;
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};
