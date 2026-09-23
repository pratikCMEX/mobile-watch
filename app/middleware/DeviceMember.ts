import { NextFunction, Request, Response } from "express";
import db from "../models";
import { errorMessage } from "../library/Response";

/**
 * Middleware: check if the authenticated user is still a member
 * of the device they are trying to operate.
 *
 * Extracts `device_id` from req.body, req.params, or req.query.
 * If no device_id is found, the check is skipped (e.g. register_device).
 *
 * If the user is NOT a member:
 *   - Clears session_token and fcm_token from the user record
 *   - Returns 401 "You have been unassigned from this device. Please login again."
 *
 * If the user IS a member or no device_id is provided:
 *   - Calls next()
 */
const checkDeviceMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any)?.userinfo?.payload?.id;
    if (!userId) {
      return errorMessage(res, "Invalid token payload", 401);
    }

    // Extract device_id from body, params, or query
    const device_id =
      req.body?.device_id || req.params?.device_id || req.query?.device_id;

    // If no device_id, skip the check (e.g. register_device, check_app_update)
    if (!device_id) {
      return next();
    }

    const member = await db.DeviceMember.findOne({
      where: { device_id, user_id: userId },
    });

    if (!member) {
      // Force logout: clear session_token and fcm_token
      const user = await db.User.findByPk(userId);
      if (user) {
        user.session_token = "";
        user.fcm_token = "";
        await user.save();
      }
      return errorMessage(
        res,
        "You have been unassigned from this device. Please login again.",
        401
      );
    }

    next();
  } catch (err) {
    console.error("checkDeviceMember error:", err);
    return errorMessage(res, "Error checking device membership");
  }
};

export default checkDeviceMember;
