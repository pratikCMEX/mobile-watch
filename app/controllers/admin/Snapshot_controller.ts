import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { Op } from "sequelize";
import {
  canAccessAllDevices,
  canAccessDevice,
  deviceIdScope,
} from "../../helper/WatchAccess";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

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

      if (!snapshot || !(await canAccessDevice(req, snapshot.device_id))) {
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

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      const snapshots = await db.Snapshot.findAll({
        where: { device_id: device.id },
        attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
        order: [["captured_at", "DESC"]],
      });

      // Add base URL to image URLs
      const snapshotsWithFullUrl = snapshots.map((snap: any) => ({
        ...snap.toJSON(),
        image_url: snap.image_url ? `${BASE_URL}${snap.image_url}` : snap.image_url,
      }));

      return successMessage(res, "Snapshots retrieved successfully", {
        device: {
          id: device.id,
          imei: device.imei,
          device_name: device.device_name,
        },
        snapshots: snapshotsWithFullUrl,
      });
    }
  } catch (err) {
    console.error("searchSnapshot error:", err);
    return errorMessage(res, "Error searching snapshots");
  }
}

// Get all snapshots (admin view) - all devices with pagination
// Also supports search by id, imei, or search parameter (searches both id and imei)
async function getAllSnapshots(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const { id, imei, search, page = 1, limit = 20 } = body;

    console.log("getAllSnapshots request body:", { id, imei, search, page, limit });

    const offset = (Number(page) - 1) * Number(limit);

    // If id is provided, use search logic
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

      if (!snapshot || !(await canAccessDevice(req, snapshot.device_id))) {
        return errorMessage(res, "Snapshot not found");
      }

      return successMessage(res, "Snapshot retrieved successfully", snapshot);
    }

    // If imei is provided, use search logic with pagination
    if (imei && imei !== "") {
      const device = await db.Device.findOne({
        where: { imei: imei as string },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      const where: any = { device_id: device.id };

      const { count, rows } = await db.Snapshot.findAndCountAll({
        where,
        include: [
          {
            model: db.Device,
            as: "DeviceSnapshot",
            attributes: ["id", "imei", "device_name"],
          },
        ],
        attributes: ["id", "device_id", "image_url", "captured_at", "createdAt", "updatedAt"],
        order: [["captured_at", "DESC"]],
        limit: Number(limit),
        offset,
      });

      // Add base URL to image URLs
      const snapshotsWithFullUrl = rows.map((snap: any) => ({
        ...snap.toJSON(),
        image_url: snap.image_url ? `${BASE_URL}${snap.image_url}` : snap.image_url,
      }));

      return successMessage(res, "Snapshots retrieved successfully", {
        snapshots: snapshotsWithFullUrl,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(count / Number(limit)),
        },
      });
    }

    // Otherwise, return all snapshots with pagination
    // If search parameter is provided, search by id, imei, and device_name
    const where: any = {};
    const scope = await deviceIdScope(req);
    if (scope) where.device_id = scope;

    if (search && search !== "") {
      // Check if search matches an IMEI first
      const device = await db.Device.findOne({
        where: { imei: { [Op.like]: `%${search}%` } },
        attributes: ["id"],
      });

      const orConditions: any[] = [
        { id: { [Op.like]: `%${search}%` } },
      ];

      if (device) {
        orConditions.push({ device_id: device.id });
      }

      where[Op.or] = orConditions;
    }

    const { count, rows } = await db.Snapshot.findAndCountAll({
      where,
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

    // Add base URL to image URLs
    const snapshotsWithFullUrl = rows.map((snap: any) => ({
      ...snap.toJSON(),
      image_url: snap.image_url ? `${BASE_URL}${snap.image_url}` : snap.image_url,
    }));

    return successMessage(res, "Snapshots retrieved successfully", {
      snapshots: snapshotsWithFullUrl,
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

// Delete snapshot by ID
async function deleteSnapshot(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;

    if (!id) {
      return errorMessage(res, "Snapshot ID is required");
    }

    const snapshot = await db.Snapshot.findOne({ where: { id } });
    if (!snapshot || !(await canAccessDevice(req, snapshot.device_id))) {
      return errorMessage(res, "Snapshot not found");
    }

    // Delete the image file if it exists
    if (snapshot.image_url) {
      const { deleteFile } = require("../../helper/Helper");
      const imagePath = snapshot.image_url.replace("/uploads/", "");
      deleteFile("snapshot", imagePath);
    }

    await db.Snapshot.destroy({ where: { id } });

    return successMessage(res, "Snapshot deleted successfully");
  } catch (err) {
    console.error("deleteSnapshot error:", err);
    return errorMessage(res, "Error deleting snapshot");
  }
}

// Delete multiple snapshots by IDs
async function deleteMultipleSnapshots(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorMessage(res, "Snapshot IDs array is required");
    }

    const snapshots = await db.Snapshot.findAll({
      where: { id: { [Op.in]: ids } },
    });

    if (snapshots.length === 0) {
      return errorMessage(res, "No snapshots found with the provided IDs");
    }

    if (
      !(await canAccessAllDevices(
        req,
        snapshots.map((s: any) => s.device_id)
      ))
    ) {
      return errorMessage(res, "You do not have access to one or more of these snapshots");
    }

    // Delete image files
    const { deleteFile } = require("../../helper/Helper");
    for (const snapshot of snapshots) {
      if (snapshot.image_url) {
        const imagePath = snapshot.image_url.replace("/uploads/", "");
        deleteFile("snapshot", imagePath);
      }
    }

    await db.Snapshot.destroy({ where: { id: { [Op.in]: ids } } });

    return successMessage(res, `${snapshots.length} snapshots deleted successfully`);
  } catch (err) {
    console.error("deleteMultipleSnapshots error:", err);
    return errorMessage(res, "Error deleting snapshots");
  }
}

export default {
  searchSnapshot,
  getAllSnapshots,
  deleteSnapshot,
  deleteMultipleSnapshots,
};
