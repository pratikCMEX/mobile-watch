import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  customMessage,
  errorMessage,
  successMessage,
} from "../../library/Response";
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { generateAuthToken, deleteFile } from "../../helper/Helper";
import { getUserDeviceIds } from "../../helper/WatchAccess";
import { tcpServer } from "../../app";
import generateOtpTemplate from "../../email/otp";
import EmailHelper from "../../helper/EmailHelper";
import crypto from "crypto";

/**
 * Maps GMT timezone strings (e.g., "GMT-8", "GMT+5") to numeric offsets (e.g., -8, 5).
 * Used to store the timezone as a number in the database.
 */
const GMT_TO_OFFSET: Record<string, number> = {
  "GMT-12": -12,
  "GMT-11": -11,
  "GMT-10": -10,
  "GMT-9": -9,
  "GMT-8": -8,
  "GMT-7": -7,
  "GMT-6": -6,
  "GMT-5": -5,
  "GMT-4": -4,
  "GMT-3": -3,
  "GMT-2": -2,
  "GMT-1": -1,
  "GMT+0": 0,
  "GMT+1": 1,
  "GMT+2": 2,
  "GMT+3": 3,
  "GMT+4": 4,
  "GMT+5": 5,
  "GMT+6": 6,
  "GMT+7": 7,
  "GMT+8": 8,
  "GMT+9": 9,
  "GMT+10": 10,
  "GMT+11": 11,
  "GMT+12": 12,
  "GMT+13": 13,
  "GMT+14": 14,
};

const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email,
      password,
      fcm_token = "",
      device_type = "",
      force_login = true,
      time_zone = "GMT-8",
    } = req.body;

    if (!email || !password) {
      return errorMessage(res, "Email and password are required", null);
    }

    const user = await db.User.findOne({
      where: { email },
    });

    if (!user) {
      return errorMessage(res, "Invalid email or password", null);
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return errorMessage(res, "Invalid email or password", null);
    }

    // Return every watch this user is a member of (via DeviceMembers),
    // not just the ones where owner_id happens to match. This is what
    // lets a single watch be shared across multiple accounts.
    const memberDeviceIds = await getUserDeviceIds(user.id);
    const firstDevice =
      memberDeviceIds.length > 0
        ? await db.Device.findAll({
            attributes: [
              "id",
              "device_name",
              "profile_image",
              "phone_number",
              "connection_status",
              "last_updated_at",
              "timezone",
            ],
            where: { id: { [Op.in]: memberDeviceIds } },
            order: [["createdAt", "ASC"]],
          })
        : [];

    // If there are devices, check and update timezone for the first device if needed
    if (firstDevice.length > 0) {
      const offset = GMT_TO_OFFSET[time_zone] ?? -8; // Default to -8 if invalid timezone

      for (const device of firstDevice) {
        if (!device.timezone) {
          const result = tcpServer.sendLzCommand(
            device.serial_number,
            null,
            offset
          );

          await device.update({ timezone: String(offset) });
          // Update the in-memory object so the response reflects the new value
          device.timezone = String(offset);
        }
      }
    }

    /*
     * Check whether this device is already logged in.
     *
     * Assuming:
     * device.session_token = current login session
     */
    if (!force_login && user.session_token) {
      return errorMessage(res, "Device is already logged in", {
        already_logged_in: true,
      });
    }

    // Generate a new login token
    const token = await generateAuthToken(user);

    /*
     * If force_login = true:
     * replace the existing device session with the new token.
     *
     * The old session/token will no longer be valid.
     */
    user.session_token = token;
    user.fcm_token = fcm_token;
    user.device_type = device_type;

    await user.save();

    const userData = user.toJSON();
    delete userData.password;

    /*
     * Return all devices belonging to the user
     */

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
    user.fcm_token = "";
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
const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return errorMessage(res, "Email and password are required", 400);
    }

    // Check if user already exists
    const existingUser = await db.User.findOne({ where: { email } });
    if (existingUser) {
      return errorMessage(res, "User with this email already exists", 409);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const user = await db.User.create({
      name,
      email,
      password: hashedPassword,
    });

    // Generate auth token
    // const token = await generateAuthToken(user);

    // Clear password from response
    const userData = user.toJSON();
    delete userData.password;

    return successMessage(res, "User created successfully", {
      // token,
      user: userData,
    });
  } catch (error) {
    console.error("createUser error:", error);
    return errorMessage(res, "Error creating user");
  }
};

const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const lang = (req as any).lang;
  try {
    const userId = (req as any)?.userinfo?.payload?.id;
    const user = await db.User.findOne({
      where: { id: userId },
    });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    // A watch that is shared with other users must NOT be wiped when
    // one member deletes their account — only the leaving member's
    // DeviceMember row is removed (FK onDelete CASCADE handles that
    // when the User row is destroyed). Devices this user is the sole
    // member of are deleted too, preserving the old single-owner
    // behaviour for non-shared watches.
    const memberDeviceIds = await getUserDeviceIds(userId);
    if (memberDeviceIds.length) {
      const soleOwnedDeviceIds: string[] = [];
      for (const deviceId of memberDeviceIds) {
        const otherMembers = await db.DeviceMember.count({
          where: { device_id: deviceId, user_id: { [Op.ne]: userId } },
        });
        if (otherMembers === 0) soleOwnedDeviceIds.push(deviceId);
      }

      if (soleOwnedDeviceIds.length) {
        await db.Device.destroy({
          where: { id: { [Op.in]: soleOwnedDeviceIds } },
        });
      }
    }

    // Destroying the User row cascades their DeviceMember rows
    // (FK onDelete CASCADE), then removes the account itself.
    await user.destroy({ force: true });

    return successMessage(res, "Account deleted successfully");
  } catch (error: any) {
    console.error("Delete account error:", error);
    return res.status(500).json({ message: error.message });
  }
};

// ── Forgot Password (OTP flow) ────────────────────────────────────────────
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

/** Cryptographically secure 6 digit OTP, zero padded. */
const generateOtp = (): string => {
  return crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
};

/** Random reset token handed to the client after a successful OTP check. */
const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

const minutesFromNow = (minutes: number): Date =>
  new Date(Date.now() + minutes * 60 * 1000);

/**
 * Clears any pending OTP / reset token for a user so a new request starts clean.
 */
const clearOtpState = async (user: any) => {
  await user.update({
    otp_hash: null,
    otp_expiry: null,
    otp_attempts: 0,
    reset_token: null,
    reset_token_expiry: null,
  });
};

/**
 * API 1 — POST /forgotPassword
 * Body: { email }
 * Emails a 6 digit OTP to the account.
 */
const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email) {
      return customMessage(res, 400, "Email is required", null);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.User.findOne({
      where: { email: normalizedEmail },
    });

    /*
     * Always answer with the same generic message so this endpoint cannot be
     * used to discover which email addresses have an account.
     */
    const GENERIC_RESPONSE = successMessage(
      res,
      "If an account exists for this email, an OTP has been sent",
      {
        message: "Please check your email for the verification code",
        email: normalizedEmail,
      }
    );

    if (!user) {
      return GENERIC_RESPONSE;
    }

    // Any previous reset attempt is discarded when a new OTP is requested.
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const otpExpiry = minutesFromNow(OTP_EXPIRY_MINUTES);

    await user.update({
      otp_hash: otpHash,
      otp_expiry: otpExpiry,
      otp_attempts: 0,
      reset_token: null,
      reset_token_expiry: null,
    });

    try {
      const htmlTemplate = generateOtpTemplate({
        name: user.name || "User",
        otp,
        expiryMinutes: OTP_EXPIRY_MINUTES,
      });

      await EmailHelper.sendMail(
        htmlTemplate,
        user.email,
        "Your Password Reset Code"
      );
    } catch (emailError: any) {
      console.error("Failed to send OTP email:", emailError);
    }

    return successMessage(
      res,
      "If an account exists for this email, an OTP has been sent",
      {
        message: "Please check your email for the verification code",
        email: user.email,
        expires_in_minutes: OTP_EXPIRY_MINUTES,
        // Development convenience only — never expose the OTP in production.
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      }
    );
  } catch (error: any) {
    console.error("forgotPassword error:", error);
    return errorMessage(res, "Error processing forgot password request");
  }
};

/**
 * API 2 — POST /verifyOtp
 * Body: { email, otp }
 * Verifies the emailed OTP and returns a short lived reset token.
 */
const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return customMessage(res, 400, "Email and OTP are required", null);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.User.findOne({
      where: { email: normalizedEmail },
    });

    if (!user || !user.otp_hash) {
      return customMessage(res, 400, "Invalid or expired OTP", null);
    }

    if (!user.otp_expiry || new Date() > user.otp_expiry) {
      await clearOtpState(user);
      return customMessage(
        res,
        400,
        "OTP has expired, request a new one",
        null
      );
    }

    const isMatch = await bcrypt.compare(String(otp), user.otp_hash);

    if (!isMatch) {
      const attempts = (user.otp_attempts || 0) + 1;

      if (attempts >= MAX_OTP_ATTEMPTS) {
        await clearOtpState(user);
        return customMessage(
          res,
          400,
          "Too many incorrect attempts, request a new OTP",
          null
        );
      }

      await user.update({ otp_attempts: attempts });

      return customMessage(res, 400, "Invalid OTP", {
        attempts_remaining: MAX_OTP_ATTEMPTS - attempts,
      });
    }

    // OTP is correct — issue a reset token for the change password step and
    // wipe the OTP so it cannot be replayed.
    const resetToken = generateResetToken();
    const resetTokenExpiry = minutesFromNow(RESET_TOKEN_EXPIRY_MINUTES);

    await user.update({
      otp_hash: null,
      otp_expiry: null,
      otp_attempts: 0,
      reset_token: resetToken,
      reset_token_expiry: resetTokenExpiry,
    });

    return successMessage(res, "OTP verified successfully", {
      message: "Verification complete, you can now set a new password",
      email: user.email,
      reset_token: resetToken,
      expires_in_minutes: RESET_TOKEN_EXPIRY_MINUTES,
    });
  } catch (error: any) {
    console.error("verifyOtp error:", error);
    return errorMessage(res, "Error verifying OTP");
  }
};

/**
 * API 3 — POST /changePassword
 * Body: { reset_token, new_password, confirm_password }
 * Consumes the reset token and stores the new password.
 */
const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reset_token, new_password, confirm_password } = req.body;

    if (!reset_token || !new_password || !confirm_password) {
      return customMessage(res, 400, "All fields are required", null);
    }

    if (new_password !== confirm_password) {
      return customMessage(res, 400, "Passwords do not match", null);
    }

    if (new_password.length < 6) {
      return customMessage(
        res,
        400,
        "Password must be at least 6 characters",
        null
      );
    }

    const user = await db.User.findOne({
      where: { reset_token },
    });

    if (!user) {
      return customMessage(res, 400, "Invalid or expired reset token", null);
    }

    if (!user.reset_token_expiry || new Date() > user.reset_token_expiry) {
      await user.update({ reset_token: null, reset_token_expiry: null });
      return customMessage(res, 400, "Reset token has expired", null);
    }

    const hashedPassword = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

    // Single use — clear both the token and any leftover OTP state.
    await user.update({
      password: hashedPassword,
      reset_token: null,
      reset_token_expiry: null,
      otp_hash: null,
      otp_expiry: null,
      otp_attempts: 0,
    });

    return successMessage(res, "Password changed successfully", {
      message: "Your password has been changed successfully",
    });
  } catch (error: any) {
    console.error("changePassword error:", error);
    return errorMessage(res, "Error changing password");
  }
};

export default {
  login,
  logout,
  updateProfile,
  getProfile,
  createUser,
  deleteAccount,
  forgotPassword,
  verifyOtp,
  changePassword,
};
