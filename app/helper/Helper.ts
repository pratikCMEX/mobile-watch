import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import db from "../models";
import { NextFunction, Request, Response } from "express";
import nodemailer from "nodemailer";

export const generateAuthToken = (user: {
  id: string;
  name: string;

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

      },
    },
    JWT_ENCRYPTION
  );
};

const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.MAIL_FROM_ADDRESS || process.env.EMAIL_USER,
      to,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export const sendWelcomeEmail = async (email: string, name: string, password: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Mobile Watch</h2>
      <p style="color: #666;">Hello ${name},</p>
      <p style="color: #666;">Your account has been created successfully. Here are your login credentials:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
      </div>
      <p style="color: #666;">Please login and change your password for security.</p>
      <p style="color: #666;">Best regards,<br>Mobile Watch Team</p>
    </div>
  `;

  await sendEmail(email, "Welcome to Mobile Watch - Your Account Details", html);
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
