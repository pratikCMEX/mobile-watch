import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";
import { t } from "../../i18n/index";

/**
 * Build the FULL public URL for a snapshot file.
 *
 * Priority:
 *   1. PUBLIC_BASE_URL env var (if set) — useful when the API is
 *      behind a reverse proxy / domain the server doesn't know about.
 *   2. The incoming request's protocol + Host header
 *      (`<req.protocol>://<req.get('host')>`).
 *
 * `imagePath` may be:
 *   - a full URL          → returned as-is.
 *   - a path starting with "/uploads/" → resolved against the base.
 *   - a bare filename     → wrapped in /uploads/snapshots/<name>.
 *   - null/empty          → null.
 */
const buildImageUrl = (
  req: Request,
  imagePath: string | null | undefined
): string | null => {
  if (!imagePath) return null;

  // Already an absolute URL (http://, https://) — pass through.
  if (/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  // Normalise whatever is stored into a "/uploads/snapshots/<file>" path.
  let pathPart: string;
  if (imagePath.startsWith("/uploads/")) {
    pathPart = imagePath;
  } else {
    // Bare filename or other relative path — assume snapshots dir.
    const filename = imagePath.replace(/^\/+/, "");
    pathPart = `/uploads/snapshots/${filename}`;
  }

  const base =
    process.env.PUBLIC_BASE_URL ||
    `${req.protocol}://${req.get("host") || "localhost"}`;

  // Avoid double slashes when joining.
  return `${base.replace(/\/+$/, "")}${pathPart}`;
};

const AddSnapshot = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id } = req.body;
    if (!device_id) {
      return errorMessage(res, "device_id_is_required");
    }
    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_not_found");
    }

    const files = (req as any).files as { [fieldname: string]: any[] };
    const uploaded = files?.image?.[0];
    if (!uploaded || !uploaded.filename) {
      return errorMessage(
        res,
        "image_file_is_required_multipart_form_data_field_image"
      );
    }

    // Store the relative path so the API stays portable; the listing
    // endpoints will turn this into a full URL on the way out.
    const image_url = `/uploads/snapshots/${uploaded.filename}`;

    const snapshot = await db.Snapshot.create({
      device_id: device_id,
      image_url,
      captured_at: new Date(),
    });

    // Return the freshly-created row with a full URL too, so the
    // caller doesn't have to do another round-trip to resolve it.
    const responseRow = snapshot.toJSON();
    responseRow.image_url = buildImageUrl(req, responseRow.image_url);

    return successMessage(res, "snapshot_added_successfully", responseRow);
  } catch (err: any) {
    console.error("AddSnapshot error:", err);
    if (err && err.message) {
      return errorMessage(res, err.message);
    }
    return errorMessage(res, "error_adding_snapshot");
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
      return errorMessage(res, "device_id_is_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_not_found");
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

    // Resolve image_url to a FULL absolute URL for every row.
    const data = rows.map((row: any) => {
      const j = row.toJSON();
      j.image_url = buildImageUrl(req, j.image_url);
      return j;
    });

    return successPagination(res, "snapshots_fetched_successfully", data, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("ListSnapshots error:", err);
    return errorMessage(res, "error_fetching_snapshots");
  }
};

async function getAllSnapshots(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const alldata = await db.Snapshot.findAll();
    console.log("alldata:", alldata);

    const body = req.body || {};
    const { id, imei } = body;

    console.log("getAllSnapshots request body:", { id, imei });

    // const offset = (Number(page) - 1) * Number(limit);

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
          return errorMessage(res, "snapshot_not_found");
        }

        return successMessage(res, "snapshot_retrieved_successfully", snapshot);
      }

      if (imei) {
        const device = await db.Device.findOne({
          where: { imei: imei as string },
          attributes: ["id", "imei", "device_name"],
        });

        if (!device) {
          return errorMessage(res, "device_not_found_with_this_imei");
        }

        const snapshots = await db.Snapshot.findAll({
          where: { device_id: device.id },
          attributes: [
            "id",
            "device_id",
            "image_url",
            "captured_at",
            "createdAt",
            "updatedAt",
          ],
          order: [["captured_at", "DESC"]],
        });

        return successMessage(res, "snapshots_retrieved_successfully", {
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
      attributes: [
        "id",
        "device_id",
        "image_url",
        "captured_at",
        "createdAt",
        "updatedAt",
      ],
      order: [["captured_at", "DESC"]],
      // limit: Number(limit),
      // offset,
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
      attributes: [
        "id",
        "device_id",
        "image_url",
        "captured_at",
        "createdAt",
        "updatedAt",
      ],
      order: [["captured_at", "DESC"]],
      // limit: Number(limit),
      // offset,
    });

    return successMessage(res, "snapshots_retrieved_successfully", {
      snapshots: rows,
      pagination: {
        total: count,
        // page: Number(page),
        // limit: Number(limit),
        // totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (err) {
    console.error("getAllSnapshots error:", err);
    console.error("Error details:", JSON.stringify(err, null, 2));
    return errorMessage(res, "error_retrieving_snapshots");
  }
}
const GetSnapshotsBySerialNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const snapshots = await db.Snapshot.findAll({
      where: { device_id: device.id },
      attributes: ["id", "device_id", "image_url", "createdAt", "updatedAt"],
      order: [["createdAt", "DESC"]],
    });

    // Resolve every image_url to a FULL absolute URL. Tolerates
    // rows that were stored as a bare filename (legacy) or as a
    // /uploads/... path.
    const snapshotsWithUrl = snapshots.map((snapshot: any) => {
      const data = snapshot.toJSON();
      return {
        ...data,
        image_url: buildImageUrl(req, data.image_url),
      };
    });

    return successMessage(res, "snapshots_fetched_successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      snapshot_count: snapshotsWithUrl.length,
      snapshots: snapshotsWithUrl,
    });
  } catch (err) {
    console.error("GetSnapshotsBySerialNumber error:", err);
    return errorMessage(res, "error_fetching_snapshots");
  }
};

const deleteSnapshot = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;
  const snapshot = await db.Snapshot.findByPk(id);
  if (snapshot) {
    await snapshot.destroy();
    return successMessage(res, "snapshot_deleted_successfully", snapshot);
  } else {
    return errorMessage(res, "snapshot_not_found", 404);
  }
};
export default {
  AddSnapshot,
  ListSnapshots,
  GetSnapshotsBySerialNumber,
  deleteSnapshot,
  getAllSnapshots,
};
