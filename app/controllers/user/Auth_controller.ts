import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import bcrypt from "bcrypt";
import { generateAuthToken } from "../../helper/Helper";
const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return errorMessage(res, "Email and password are required", 400);
    }

    const user = await db.User.findOne({ where: { email } });
    if (!user) {
      return errorMessage(res, "Invalid email or password", 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorMessage(res, "Invalid email or password", 401);
    }

    // if (user.status && user.status !== "active") {
    //   return errorMessage(res, `Account is ${user.status}`, 403);
    // }

    const token = await generateAuthToken(user);

    user.session_token = token;
    await user.save();

    const userData = user.toJSON();
    delete userData.password;

    const firstDevice = await db.Device.findAll({
      attributes: [
        "id",
        "device_name",
        "profile_image",
        "connection_status",
        "last_updated_at",
      ],
      where: { owner_id: user.id },
      order: [["createdAt", "ASC"]],
    });

    return successMessage(res, "Login successful", {
      token,
      user: userData,
      device: firstDevice,
    });
  } catch (error) {
    console.error("login error:", error);
    return errorMessage(res, "Error logging in");
  }
};

const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // checkToken middleware decodes the token and sets req.userinfo
    const userId = (req as any)?.userinfo?.payload?.id;

    if (!userId) {
      return errorMessage(res, "Invalid token payload", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return errorMessage(res, "User not found", 404);
    }

    // Invalidate the active session by clearing the stored token.
    // Subsequent requests using this token will be rejected by checkToken
    // because user.session_token !== incoming token.
    user.session_token = "";
    await user.save();

    return successMessage(res, "Logout successful", null);
  } catch (error) {
    console.error("logout error:", error);
    return errorMessage(res, "Error logging out");
  }
};

export default {
  login,
  logout,
};
