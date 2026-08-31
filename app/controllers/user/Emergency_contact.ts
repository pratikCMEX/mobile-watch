import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

async function createOrUpdateEmergencyContact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, name, country_code, phone_number, device_id } = req.body;

    if (id || id !== "") {
      // Update existing emergency contact
      const [affectedCount] = await db.EmergencyContact.update(
        {
          name,
          country_code,
          phone_number,
          device_id,
        },
        { where: { id } }
      );

      if (affectedCount === 0) {
        return errorMessage(res, "Emergency contact not found", 404);
      }

      const updatedContact = await db.EmergencyContact.findByPk(id);
      return successMessage(
        res,
        "Emergency contact updated successfully",
        updatedContact
      );
    } else {
      // Create new emergency contact
      const emergency_contact = await db.EmergencyContact.create({
        name,
        country_code,
        phone_number,
        device_id,
      });

      return successMessage(
        res,
        "Emergency contact created successfully",
        emergency_contact
      );
    }
  } catch (err) {
    console.error("createOrUpdateEmergencyContact error:", err);
    return errorMessage(res, "Error saving emergency contact");
  }
}

async function deleteEmergencyContact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const emergency_contact = await db.EmergencyContact.destroy({
      where: { id },
    });
    return successMessage(
      res,
      "Emergency contact deleted successfully",
      emergency_contact
    );
  } catch (err) {
    console.error("deleteEmergencyContact error:", err);
    return errorMessage(res, "Error deleting emergency contact");
  }
}

const allEmergencyContact = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      device_id = "",
      // status = "",
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};
    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone_number: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (device_id != "") {
      whereCondition.device_id = device_id;
    }

    const { count, rows } = await db.EmergencyContact.findAndCountAll({
      where: whereCondition,
      attributes: ["id", "name", "country_code", "phone_number", "createdAt"],
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

const getEmergencyContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const emergency_contact = await db.EmergencyContact.findOne({
      where: { id },
    });
    if (!emergency_contact) {
      return errorMessage(res, "Emergency contact not found");
    }
    return successMessage(
      res,
      "Emergency contact fetched successfully",
      emergency_contact
    );
  } catch (err) {
    console.error("getEmergencyContact error:", err);
    return errorMessage(res, "Error fetching emergency contact");
  }
};
export {
  createOrUpdateEmergencyContact,
  deleteEmergencyContact,
  allEmergencyContact,
  getEmergencyContact,
};
