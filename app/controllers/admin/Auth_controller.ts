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
      email: admin.email || "",
    });


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

export default {
  adminLogin,
};
