import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

/**
 * Create a new app update record.
 *
 * Body: { apk_version, type, force_update }
 */
async function createAppUpdate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { apk_version, type, force_update } = req.body;

    const appUpdate = await db.AppUpdate.create({
      apk_version,
      type,
      force_update: force_update ?? false,
    });

    return successMessage(res, "App update created successfully", appUpdate);
  } catch (err) {
    console.error("createAppUpdate error:", err);
    return errorMessage(res, "Error creating app update");
  }
}

/**
 * List app updates with optional search / filter / pagination.
 *
 * Body: { search?, page?, sorting?, limit?, type? }
 */
async function listAppUpdates(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      type = null,
    } = body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};

    if (search) {
      whereCondition[Op.or] = [
        { apk_version: { [Op.iLike]: `%${search}%` } },
        { type: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (type) {
      whereCondition.type = type;
    }

    const { count, rows } = await db.AppUpdate.findAndCountAll({
      where: whereCondition,
      order: [["createdAt", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "App updates fetched successfully", rows, {
      page,
      limit,
      total: count,
    });
  } catch (error) {
    console.error("listAppUpdates error:", error);
    return errorMessage(res, "Error fetching app updates");
  }
}

/**
 * Update an existing app update record.
 *
 * Body: { id, apk_version?, type?, force_update? }
 */
async function updateAppUpdate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, apk_version, type, force_update } = req.body;

    const appUpdate = await db.AppUpdate.findOne({ where: { id } });

    if (!appUpdate) {
      return errorMessage(res, "App update not found");
    }

    const updateData: any = {};
    if (apk_version !== undefined) updateData.apk_version = apk_version;
    if (type !== undefined) updateData.type = type;
    if (force_update !== undefined) updateData.force_update = force_update;

    await appUpdate.update(updateData);

    const updated = await db.AppUpdate.findOne({ where: { id } });

    return successMessage(res, "App update updated successfully", updated);
  } catch (err) {
    console.error("updateAppUpdate error:", err);
    return errorMessage(res, "Error updating app update");
  }
}

/**
 * Delete an app update record.
 *
 * Body: { id }
 */
async function deleteAppUpdate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.body;

    const appUpdate = await db.AppUpdate.findOne({ where: { id } });

    if (!appUpdate) {
      return errorMessage(res, "App update not found");
    }

    await appUpdate.destroy();

    return successMessage(res, "App update deleted successfully");
  } catch (err) {
    console.error("deleteAppUpdate error:", err);
    return errorMessage(res, "Error deleting app update");
  }
}

/**
 * Get a single app update by ID.
 *
 * Body: { id }
 */
async function getAppUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;

    if (!id) {
      return errorMessage(res, "App update ID is required");
    }

    const appUpdate = await db.AppUpdate.findOne({ where: { id } });

    if (!appUpdate) {
      return errorMessage(res, "App update not found");
    }

    return successMessage(res, "App update fetched successfully", appUpdate);
  } catch (err) {
    console.error("getAppUpdate error:", err);
    return errorMessage(res, "Error fetching app update");
  }
}

export default {
  createAppUpdate,
  listAppUpdates,
  updateAppUpdate,
  deleteAppUpdate,
  getAppUpdate,
};
