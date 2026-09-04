import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { generateAuthToken, deleteFile } from "../../helper/Helper";
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

const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any)?.userinfo?.payload?.id;
    if (!userId) {
      return errorMessage(res, "Invalid token payload", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return errorMessage(res, "User not found", 404);
    }

    const {
      name,
      email,
      phone_number,
      country_code,
      password,
      remove_profile_image,
    } = req.body;

    // If email is being changed, ensure it isn't taken by another user
    if (email && email !== user.email) {
      const existing = await db.User.findOne({
        where: { email, id: { [Op.ne]: userId } },
      });
      if (existing) {
        return errorMessage(res, "Email already in use by another account");
      }
      user.email = email;
    }

    if (name !== undefined && name !== "") user.name = name;
    if (phone_number !== undefined) user.phone_number = phone_number;
    if (country_code !== undefined) user.country_code = country_code;

    // Optional password change — hash if provided
    if (password !== undefined && password !== "") {
      user.password = await bcrypt.hash(password, 10);
    }

    // Profile image — uploaded via multipart/form-data (field: "profile_image")
    const uploadedFile = (req as any).file;
    if (uploadedFile && uploadedFile.filename) {
      // Delete the old profile image file before replacing it
      const oldImage = user.getDataValue("profile_image");
      if (oldImage) {
        deleteFile("profile", oldImage);
      }
      user.profile_image = uploadedFile.filename;
    }

    // Allow the client to remove the current profile image
    if (remove_profile_image === "true" || remove_profile_image === true) {
      const oldImage = user.getDataValue("profile_image");
      if (oldImage) {
        deleteFile("profile", oldImage);
      }
      user.profile_image = null;
    }

    await user.save();

    const userData = user.toJSON();
    delete userData.password;

    return successMessage(res, "Profile updated successfully", userData);
  } catch (err: any) {
    console.error("updateProfile error:", err);
    return errorMessage(
      res,
      err?.message
        ? `Error updating profile: ${err.message}`
        : "Error updating profile"
    );
  }
};

const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any)?.userinfo?.payload?.id;
    if (!userId) {
      return errorMessage(res, "Invalid token payload", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return errorMessage(res, "User not found", 404);
    }

    return successMessage(res, "Profile fetched successfully", user);
  } catch (error) {
    console.error("getProfile error:", error);
    return errorMessage(res, "Error fetching profile");
  }
};
export default {
  login,
  logout,
  updateProfile,
  getProfile,
};
