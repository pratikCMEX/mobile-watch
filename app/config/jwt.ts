import { errorMessage } from "../library/Response";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../models";

dotenv.config();

const JWT_SECRET = process.env.JWT_ENCRYPTION || "";

// ─── Reusable token extractor ──────────────────────────────────
const extractToken = (req: any): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
    return authHeader.slice(7);
  }
  return authHeader;
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

    console.log("userId-sasasasasasas", userId);

    const user = await db.User.findOne({
      where: { id: userId },
      attributes: ["id", "session_token"],
    });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    // if (user.status !== "1") {
    //   return errorMessage(res, "Account is inactive or blocked");
    // }
    // console.log(token);
    // console.log(user.session_token);

    if (user.session_token !== token) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    req.userinfo = decoded;
    next();
  } catch (error) {
    return errorMessage(res, "Invalid or expired token");
  }
};

// ─── Check Admin ───────────────────────────────────────────────
export const checkAdmin = (req: any, res: any, next: any) => {
  try {
    const token = extractToken(req);
    if (!token) return errorMessage(res, "Auth token is not supplied");

    const decoded = verifyToken(token);
    const role = decoded?.payload?.role;
    console.log("role   ", role);

    if (!role) {
      return res
        .status(403)
        .json({ success: false, message: "No role found in token" });
    }

    if (role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. Admins only" });
    }

    req.userinfo = decoded;
    next();
  } catch (error) {
    return errorMessage(res, "Invalid or expired token");
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
