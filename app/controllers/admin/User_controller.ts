import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";
import bcrypt from "bcrypt";
import { generateAuthToken } from "../../helper/Helper";

async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, phone_number, country_code } = req.body;
    if (!name || !email || !password) {
      return errorMessage(res, "Name, email and password are required");
    }
    const existing = await db.User.findOne({ where: { email } });
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
    return successMessage(res, "User created successfully", user);
  } catch (err) {
    console.error("createUser error:", err);
    return errorMessage(res, "Error creating user");
  }
}
const allUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 20,
      // status = "",
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};
    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
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
    // console.error("SQL Error:", error);
    return errorMessage(res, "Error fetching users");
  }
};
async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, name, email, password, phone_number, country_code } = req.body;
    if (!name || !email || !password) {
      return errorMessage(res, "Name, email and password are required");
    }
    const existing = await db.User.findOne({
      where: { email, id: { [Op.ne]: id } },
    });
    if (existing) {
      return errorMessage(res, "A user with this email already exists");
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await db.User.update(
      {
        name,
        email,
        password: password_hash,
        phone_number,
        country_code,
      },
      { where: { id } }
    );

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
    const { id } = req.params;
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
    const { id } = req.params;
    const user = await db.User.findOne({ where: { id } });
    if (!user) {
      return errorMessage(res, "User not found");
    }
    return successMessage(res, "User fetched successfully", user);
  } catch (err) {
    console.error("getUserDetail error:", err);
    return errorMessage(res, "Error fetching user");
  }
}
export default {
  createUser,
  updateUser,
  deleteUser,
  allUsers,
  getUserDetail,
};
