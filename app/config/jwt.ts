import { errorMessage } from "../library/Response";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../models";
import { NextFunction, Request, Response } from "express";

dotenv.config();

const JWT_SECRET = process.env.JWT_ENCRYPTION || "";

if (!JWT_SECRET) {
  // Fail loudly at startup instead of silently signing/verifying with an
  // empty string — this is the #1 cause of "works on login, fails on
  // verify" bugs when the env var name doesn't match between files.
  console.error(
    "FATAL: JWT_ENCRYPTION is not set in the environment. " +
    "Token verification will always fail until this is fixed."
  );
}

// ─── Reusable token extractor ──────────────────────────────────
// Accepts the token from the Authorization header ("Bearer <token>" or
// raw), and falls back to req.body.token / req.query.token if the header
// isn't present. Also guards against an accidental double "Bearer Bearer"
// prefix, which happens if a client re-sends a header value that already
// included the prefix.
const extractToken = (req: any): string | null => {
  const authHeader = req.headers?.authorization;

  if (authHeader && typeof authHeader === "string") {
    const trimmed = authHeader.trim();
    // Strip one or more "Bearer " prefixes, case-insensitive
    const stripped = trimmed.replace(/^(bearer\s+)+/i, "");
    if (stripped) return stripped;
  }

  // Fallback: token sent in the body or query string
  const bodyToken = req.body?.token;
  if (bodyToken && typeof bodyToken === "string") {
    return bodyToken.replace(/^(bearer\s+)+/i, "").trim();
  }

  const queryToken = req.query?.token;
  if (queryToken && typeof queryToken === "string") {
    return queryToken.replace(/^(bearer\s+)+/i, "").trim();
  }

  return null;
};

// ─── Reusable token verifier ───────────────────────────────────
const verifyToken = (token: string): any => {
  return jwt.verify(token, JWT_SECRET);
};

// ─── Check User (any logged in user) ──────────────────────────
export const checkToken = async (req: any, res: any, next: any) => {
  try {
    const token = extractToken(req);

    if (!token) return errorMessage(res, "Auth token is not supplied");

    const decoded = verifyToken(token);
    const userId = decoded?.payload?.id;

    if (!userId) {
      return errorMessage(res, "Invalid token payload");
    }

    const user = await db.User.findOne({
      where: { id: userId },
      attributes: ["id", "session_token"],
    });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    if (user.session_token !== token) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    req.userinfo = decoded;
    next();
  } catch (error: any) {
    if (error?.name === "TokenExpiredError") {
      return errorMessage(res, "Token expired. Please login again.");
    }
    if (error?.name === "JsonWebTokenError") {
      return errorMessage(res, "Invalid token. Please login again.");
    }
    return errorMessage(res, "Invalid or expired token");
  }
};

// ─── Check Admin ───────────────────────────────────────────────
export const checkAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);

    if (!token) return errorMessage(res, "Auth token is not supplied");

    const decoded = verifyToken(token);
    const adminId = decoded?.payload?.id;

    if (!adminId) {
      return errorMessage(res, "Invalid token payload");
    }

    const admin = await db.Admin.findOne({
      where: { id: adminId },
      attributes: ["id", "username", "status", "session_token"],
    });

    if (!admin) {
      return errorMessage(res, "Admin not found");
    }

    if (admin.status !== "active") {
      return errorMessage(res, "Admin account is inactive");
    }

    if (!admin.session_token || admin.session_token !== token) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
        data: {},
      });
    }

    (req as any).user = { id: admin.id, username: admin.username };
    (req as any).userinfo = decoded;
    next();
  } catch (error: any) {
    console.error("checkAdmin error:", error.message);
    console.error("Error name:", error?.name);
    if (error?.name === "TokenExpiredError") {
      return errorMessage(res, "Token expired. Please login again.");
    }
    if (error?.name === "JsonWebTokenError") {
      return errorMessage(res, "Invalid token. Please login again.");
    }
    return errorMessage(res, "Invalid or expired token. Please login again.");
  }
};

// ─── Optional Token (no error if missing) ─────────────────────
export const checkOptionalToken = (req: any, res: any, next: any) => {
  try {
    const token = extractToken(req);
    if (!token) return next();

    const decoded = verifyToken(token);
    req.userinfo = decoded;
    next();
  } catch (error) {
    next();
  }
};