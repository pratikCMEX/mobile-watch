import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { generateAuthToken } from "../../helper/Helper";

async function adminLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return errorMessage(res, "Username and password are required");
    }

    const admin = await db.Admin.findOne({ where: { username } });

    if (!admin) {
      return errorMessage(res, "Invalid credentials");
    }

    if (admin.status !== "active") {
      return errorMessage(res, "Admin account is inactive");
    }

    const isPasswordValid = await admin.comparePassword(password);

    if (!isPasswordValid) {
      return errorMessage(res, "Invalid credentials");
    }

    const token = generateAuthToken({
      id: admin.id,
      name: admin.username,
    });

    admin.session_token = token;
    await admin.save();

    
    res.setHeader("Authorization", `Bearer ${token}`);
    res.setHeader("Access-Control-Expose-Headers", "Authorization");

    return successMessage(res, "Login successful", {
      admin: {
        id: admin.id,
        username: admin.username,
        status: admin.status,
      },
      token,
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    return errorMessage(res, "Error logging in");
  }
}

async function updatePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { oldPassword, newPassword } = req.body;
    const adminId = (req as any).user?.id;

    if (!adminId) {
      return errorMessage(res, "Admin not authenticated");
    }

    if (!oldPassword || !newPassword) {
      return errorMessage(res, "oldPassword and newPassword are required");
    }

    const admin = await db.Admin.findOne({ where: { id: adminId } });

    if (!admin) {
      return errorMessage(res, "Admin not found");
    }

    const isOldPasswordValid = await admin.comparePassword(oldPassword);

    if (!isOldPasswordValid) {
      return errorMessage(res, "Old password is incorrect");
    }

    admin.password = newPassword;
    await admin.save();

    const allAdmins = await db.Admin.findAll({
      attributes: ["id", "username", "createdAt", "updatedAt"],
    });

    return successMessage(res, "Password updated successfully", allAdmins);
  } catch (err) {
    console.error("updatePassword error:", err);
    return errorMessage(res, "Error updating password");
  }
}

async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (req as any).user?.id;

    if (adminId) {
      const admin = await db.Admin.findOne({ where: { id: adminId } });
      if (admin) {
        admin.session_token = "";
        await admin.save();
      }
    }

    const allAdmins = await db.Admin.findAll({
      attributes: ["id", "username", "createdAt", "updatedAt"],
    });

    return successMessage(res, "Logout successful", allAdmins);
  } catch (err) {
    console.error("logout error:", err);
    return errorMessage(res, "Error logging out");
  }
}

export default {
  adminLogin,
  updatePassword,
  logout,
};