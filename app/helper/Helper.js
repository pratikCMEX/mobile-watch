"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlinkUploadedFiles = exports.deleteFiles = exports.deleteFile = exports.generateAuthToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const generateAuthToken = (user) => {
    const JWT_ENCRYPTION = process.env.JWT_ENCRYPTION || "";
    if (!JWT_ENCRYPTION) {
        throw new Error("JWT_ENCRYPTION is not defined in environment variables");
    }
    return jsonwebtoken_1.default.sign({
        payload: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
    }, JWT_ENCRYPTION);
};
exports.generateAuthToken = generateAuthToken;
const deleteFile = (folder, fileUrlOrName) => {
    if (!fileUrlOrName)
        return;
    const filename = fileUrlOrName.split("/").pop();
    if (!filename)
        return;
    const filePath = path_1.default.join(process.cwd(), "uploads", folder, filename);
    fs_1.default.unlink(filePath, (err) => {
        if (err)
            console.error(`Failed to delete file [${filePath}]:`, err.message);
        else
            console.log(`✅ Deleted: ${filePath}`);
    });
};
exports.deleteFile = deleteFile;
const deleteFiles = (folder, fileUrls) => {
    fileUrls.forEach((fileUrl) => deleteFile(folder, fileUrl));
};
exports.deleteFiles = deleteFiles;
const unlinkUploadedFiles = (req) => {
    const files = req.files;
    if (files) {
        Object.values(files).forEach((fileArray) => {
            fileArray.forEach((file) => {
                fs_1.default.unlink(file.path, (err) => {
                    if (err)
                        console.log(`Failed to delete file: ${file.path}`);
                });
            });
        });
    }
};
exports.unlinkUploadedFiles = unlinkUploadedFiles;
