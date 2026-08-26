import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import db from "../models";
import { NextFunction, Request, Response } from "express";

export const generateAuthToken = (user: {
  id: string;
  name: string;
  email: string;
}) => {
  const JWT_ENCRYPTION = process.env.JWT_ENCRYPTION || "";
  if (!JWT_ENCRYPTION) {
    throw new Error("JWT_ENCRYPTION is not defined in environment variables");
  }
  return jwt.sign(
    {
      payload: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    },
    JWT_ENCRYPTION
  );
};

const deleteFile = (folder: string, fileUrlOrName: string): void => {
  if (!fileUrlOrName) return;
  const filename = fileUrlOrName.split("/").pop();
  if (!filename) return;

  const filePath = path.join(process.cwd(), "uploads", folder, filename);

  fs.unlink(filePath, (err) => {
    if (err) console.error(`Failed to delete file [${filePath}]:`, err.message);
    else console.log(`✅ Deleted: ${filePath}`);
  });
};

const deleteFiles = (folder: string, fileUrls: string[]): void => {
  fileUrls.forEach((fileUrl) => deleteFile(folder, fileUrl));
};

const unlinkUploadedFiles = (req: Request) => {
  const files = (req as any).files as { [fieldname: string]: any[] };
  if (files) {
    Object.values(files).forEach((fileArray) => {
      fileArray.forEach((file) => {
        fs.unlink(file.path, (err) => {
          if (err) console.log(`Failed to delete file: ${file.path}`);
        });
      });
    });
  }
};

export { deleteFile, deleteFiles, unlinkUploadedFiles };
