import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

async function addFamilyMember(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, mobile_no, device_id } = req.body;

    if (!name || !mobile_no || !device_id) {
      return errorMessage(res, "name_mobile_no_and_device_id_are_required");
    }

    const familyMember = await db.FamilyMember.create({
      name,
      mobile_no,
      device_id,
    });

    return successMessage(
      res,
      "family_member_added_successfully",
      familyMember
    );
  } catch (err) {
    console.error("addFamilyMember error:", err);
    return errorMessage(res, "error_adding_family_member");
  }
}

async function listFamilyMembers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      device_id = "",
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};
    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { mobile_no: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (device_id != "") {
      whereCondition.device_id = device_id;
    }

    const { count, rows } = await db.FamilyMember.findAndCountAll({
      where: whereCondition,
      attributes: ["id", "name", "mobile_no", "device_id", "createdAt"],
      order: [["createdAt", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "family_members_fetched_successfully", rows, {
      page,
      limit,
      total: count,
    });
  } catch (error) {
    console.error("listFamilyMembers error:", error);
    return errorMessage(res, "error_fetching_family_members");
  }
}

async function deleteFamilyMember(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const familyMember = await db.FamilyMember.findOne({
      where: { id },
    });

    if (!familyMember) {
      return errorMessage(res, "family_member_not_found");
    }

    await db.FamilyMember.destroy({
      where: { id },
    });

    return successMessage(res, "family_member_deleted_successfully");
  } catch (err) {
    console.error("deleteFamilyMember error:", err);
    return errorMessage(res, "error_deleting_family_member");
  }
}

export default {
  addFamilyMember,
  listFamilyMembers,
  deleteFamilyMember,
};
