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
    const uploaded = files?.image?.[0];
    if (!uploaded || !uploaded.filename) {
      return errorMessage(
        res,
        "image file is required (multipart/form-data field 'image')"
      );
    }

    // Store the public URL (matches the static handler in app.ts and the
    // folder used by the Multer middleware).
    const image_url = `/uploads/snapshots/${uploaded.filename}`;

    const snapshot = await db.Snapshot.create({
      device_id: device_id,
      image_url,
      captured_at: new Date(),
    });
    return successMessage(res, "Snapshot added successfully", snapshot);
  } catch (err: any) {
    console.error("AddSnapshot error:", err);
    // Multer errors (file type / size / etc.) come through here
    if (err && err.message) {
      return errorMessage(res, err.message);
    }
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

    const data = rows.map((row: any) => {
      const j = row.toJSON();
      j.image_url = j.image_url
        ? j.image_url.startsWith("/uploads/")
          ? j.image_url
          : `/uploads/snapshots/${j.image_url}`
        : null;
      return j;
    });

    return successPagination(res, "Snapshots fetched successfully", data, {
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

    // Add full image URL to each snapshot (works whether image_url was
    // stored as just a filename or as a full /uploads/... path).
    const snapshotsWithUrl = snapshots.map((snapshot: any) => {
      const data = snapshot.toJSON();
      let url: string | null = data.image_url;
      if (url && !url.startsWith("/uploads/")) {
        url = `/uploads/snapshots/${url}`;
      }
      return {
        ...data,
        image_url: url,
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
