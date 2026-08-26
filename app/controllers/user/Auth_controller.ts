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

    return successMessage(res, "Login successful", {
      token,
      user: userData,
    });
  } catch (error) {
    console.error("login error:", error);
    return errorMessage(res, "Error logging in");
  }
};

export default {
  login,
};
