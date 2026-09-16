import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";
import bcrypt from "bcrypt";

import { generateAuthToken, sendWelcomeEmail } from "../../helper/Helper";

async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, phone_number, country_code } = req.body;
    if (!name || !email || !password) {
      return errorMessage(res, "Name, email and password are required");
    }
    const existing = await db.User.findOne({ 
      where: { email, deletedAt: null } 
    });
    if (existing) {
      return errorMessage(res, "A user with this email already exists");
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await db.User.create({
      name,
      email,
      password: password_hash,
      phone_number,
      country_code,
    });

    // Send welcome email with credentials
    try {
      await sendWelcomeEmail(email, name, password);
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
      // Continue with response even if email fails
    }

    return successMessage(res, "User created successfully", user);
  } catch (err) {
    console.error("createUser error:", err);
    return errorMessage(res, "Error creating user");
  }
}
const allUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 20,
      // status = "",
    } = body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};
    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone_number: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // if (status != "") {
    //   whereCondition.status = status;
    // }

    const { count, rows } = await db.User.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id",
        "name",
        "email",
        "country_code",
        "phone_number",
        "createdAt",
      ],
      order: [["createdAt", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Users fetched successfully", rows, {
      page,
      limit,
      total: count,
    });
  } catch (error) {
    console.error("allUsers error:", error);
    return errorMessage(res, "Error fetching users");
  }
};
async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, name, password, phone_number, country_code } = req.body;
    if (!id) {
      return errorMessage(res, "User ID is required");
    }

    const updateData: any = {};

    if (name) updateData.name = name;
    if (phone_number) updateData.phone_number = phone_number;
    if (country_code) updateData.country_code = country_code;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await db.User.update(updateData, { where: { id } });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    const updatedUser = await db.User.findOne({ where: { id } });

    return successMessage(res, "User updated successfully", updatedUser);
  } catch (err) {
    console.error("updateUser error:", err);
    return errorMessage(res, "Error updating user");
  }
}

async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;
    const user = await db.User.findOne({ where: { id } });
    if (!user) {
      return errorMessage(res, "User not found");
    }
    await db.User.destroy({ where: { id } });
    return successMessage(res, "User deleted successfully");
  } catch (err) {
    console.error("deleteUser error:", err);
    return errorMessage(res, "Error deleting user");
  }
}
async function getUserDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;
    if (!id) {
      return errorMessage(res, "User ID is required");
    }
    const user = await db.User.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return errorMessage(res, "User not found");
    }
    return successMessage(res, "User fetched successfully", user);
  } catch (err) {
    console.error("getUserDetail error:", err);
    return errorMessage(res, "Error fetching user");
  }
}

async function getCurrentAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const adminData = (req as any).user;
    if (!adminData) {
      return errorMessage(res, "Admin not found in request");
    }

    const admin = await db.Admin.findOne({
      where: { id: adminData.id },
      attributes: { exclude: ["password"] },
    });

    if (!admin) {
      return errorMessage(res, "Admin not found");
    }

    return successMessage(res, "Admin fetched successfully", admin);
  } catch (err) {
    console.error("getCurrentAdmin error:", err);
    return errorMessage(res, "Error fetching admin");
  }
}

export default {
  createUser,
  updateUser,
  deleteUser,
  allUsers,
  getUserDetail,
  getCurrentAdmin,
};
