import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

const AddSnapshot = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id } = req.body;
    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }
    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }
    const files = (req as any).files as { [fieldname: string]: any[] };
    const image = files?.image?.[0]?.filename ?? null;
    const snapshot = await db.Snapshot.create({
      device_id: device_id,
      image_url: image ?? null,
    });
    return successMessage(res, "Snapshot added successfully", snapshot);
  } catch (err) {
    console.error("AddSnapshot error:", err);
    return errorMessage(res, "Error adding snapshot");
  }
};

const ListSnapshots = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      device_id,
      page = 1,
      limit = 10,
      sorting = "DESC",
      start_date,
      end_date,
    } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { device_id };

    if (start_date && end_date) {
      whereCondition.createdAt = {
        [Op.between]: [new Date(start_date), new Date(end_date)],
      };
    } else if (start_date) {
      whereCondition.createdAt = { [Op.gte]: new Date(start_date) };
    } else if (end_date) {
      whereCondition.createdAt = { [Op.lte]: new Date(end_date) };
    }

    const { count, rows } = await db.Snapshot.findAndCountAll({
      where: whereCondition,
      attributes: ["id", "device_id", "image_url", "createdAt", "updatedAt"],
      order: [["createdAt", sorting.toUpperCase() === "ASC" ? "ASC" : "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Snapshots fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("ListSnapshots error:", err);
    return errorMessage(res, "Error fetching snapshots");
  }
};

const GetSnapshotsBySerialNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const snapshots = await db.Snapshot.findAll({
      where: { device_id: device.id },
      attributes: ["id", "device_id", "image_url", "createdAt", "updatedAt"],
      order: [["createdAt", "DESC"]],
    });

    // Add full image URL to each snapshot
    const snapshotsWithUrl = snapshots.map((snapshot: any) => {
      const data = snapshot.toJSON();
      return {
        ...data,
        image_url: snapshot.image_url
          ? `/uploads/snapshots/${snapshot.image_url}`
          : null,
      };
    });

    return successMessage(res, "Snapshots fetched successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      snapshot_count: snapshotsWithUrl.length,
      snapshots: snapshotsWithUrl,
    });
  } catch (err) {
    console.error("GetSnapshotsBySerialNumber error:", err);
    return errorMessage(res, "Error fetching snapshots");
  }
};

export default {
  AddSnapshot,
  ListSnapshots,
  GetSnapshotsBySerialNumber,
};
