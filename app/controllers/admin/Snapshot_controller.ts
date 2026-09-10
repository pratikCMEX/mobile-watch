import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";

// Search snapshots by ID or IMEI number
async function searchSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, imei } = req.query;

    if (!id && !imei) {
      return errorMessage(res, "Either ID or IMEI is required");
    }

    // Search by snapshot ID
    if (id) {
      const snapshot = await db.Snapshot.findOne({
        where: { id },
        include: [
          {
            model: db.Device,
            as: "DeviceSnapshot",
            attributes: ["id", "imei", "device_name", "owner_id"],
          },
        ],
      });

      if (!snapshot) {
        return errorMessage(res, "Snapshot not found");
      }

      return successMessage(res, "Snapshot retrieved successfully", snapshot);
    }

    // Search by IMEI number
    if (imei) {
      const device = await db.Device.findOne({
        where: { imei },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      const snapshots = await db.Snapshot.findAll({
        where: { device_id: device.id },
        attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
        order: [["captured_at", "DESC"]],
      });

      return successMessage(res, "Snapshots retrieved successfully", {
        device: {
          id: device.id,
          imei: device.imei,
          device_name: device.device_name,
        },
        snapshots,
      });
    }
  } catch (err) {
    console.error("searchSnapshot error:", err);
    return errorMessage(res, "Error searching snapshots");
  }
}

// Get all snapshots (admin view) - all devices with pagination
// Also supports search by id or imei in body
async function getAllSnapshots(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const { page = 1, limit = 10, id, imei } = body;

    console.log("getAllSnapshots request body:", { page, limit, id, imei });

    const offset = (Number(page) - 1) * Number(limit);

    // If id or imei is provided, use search logic
    if (id || imei) {
      if (id) {
        const snapshot = await db.Snapshot.findOne({
          where: { id: id as string },
          include: [
            {
              model: db.Device,
              as: "DeviceSnapshot",
              attributes: ["id", "imei", "device_name", "owner_id"],
            },
          ],
        });

        if (!snapshot) {
          return errorMessage(res, "Snapshot not found");
        }

        return successMessage(res, "Snapshot retrieved successfully", snapshot);
      }

      if (imei) {
        const device = await db.Device.findOne({
          where: { imei: imei as string },
          attributes: ["id", "imei", "device_name"],
        });

        if (!device) {
          return errorMessage(res, "Device not found with this IMEI");
        }

        const snapshots = await db.Snapshot.findAll({
          where: { device_id: device.id },
          attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
          order: [["captured_at", "DESC"]],
        });

        return successMessage(res, "Snapshots retrieved successfully", {
          device: {
            id: device.id,
            imei: device.imei,
            device_name: device.device_name,
          },
          snapshots,
        });
      }
    }

    // Otherwise, return all snapshots with pagination
    // First try without include to see if we get data
    const snapshotsWithoutInclude = await db.Snapshot.findAll({
      attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
      order: [["captured_at", "DESC"]],
      limit: Number(limit),
      offset,
    });
    
    console.log("Snapshots without include:", snapshotsWithoutInclude.length);
    
    const { count, rows } = await db.Snapshot.findAndCountAll({
      include: [
        {
          model: db.Device,
          as: "DeviceSnapshot",
          attributes: ["id", "imei", "device_name"],
          required: false, // LEFT JOIN instead of INNER JOIN
        },
      ],
      attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
      order: [["captured_at", "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successMessage(res, "Snapshots retrieved successfully", {
      snapshots: rows,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (err) {
    console.error("getAllSnapshots error:", err);
    console.error("Error details:", JSON.stringify(err, null, 2));
    return errorMessage(res, "Error retrieving snapshots");
  }
}

export default {
  searchSnapshot,
  getAllSnapshots,
};
