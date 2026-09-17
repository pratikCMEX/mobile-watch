import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

const STAFF_ATTRIBUTES = [
  "id",
  "name",
  "email",
  "username",
  "role",
  "status",
  "all_watches",
  "createdAt",
  "updatedAt",
];

const ASSIGNED_DEVICES_INCLUDE = {
  model: db.Device,
  as: "AssignedDevices",
  attributes: ["id", "imei", "serial_number", "device_name"],
  through: { attributes: [] },
  required: false,
};

// Returns an error message when any id does not match an existing device.
const validateDeviceIds = async (deviceIds: string[]) => {
  const uniqueIds = [...new Set(deviceIds)];
  const count = await db.Device.count({
    where: { id: { [Op.in]: uniqueIds } },
  });
  return count === uniqueIds.length
    ? null
    : "One or more device_ids do not match an existing device";
};

// Replaces the staff member's watch assignments.
const setAssignedDevices = async (
  staffId: string,
  deviceIds: string[],
  transaction: any
) => {
  await db.StaffDevice.destroy({ where: { staff_id: staffId }, transaction });
  if (deviceIds.length === 0) return;
  await db.StaffDevice.bulkCreate(
    [...new Set(deviceIds)].map((device_id) => ({
      staff_id: staffId,
      device_id,
    })),
    { transaction }
  );
};

const findStaffWithDevices = (id: string) =>
  db.Admin.findOne({
    where: { id, role: "staff" },
    attributes: STAFF_ATTRIBUTES,
    include: [ASSIGNED_DEVICES_INCLUDE],
  });

// Usernames stay unique across soft-deleted rows too (DB constraint).
const usernameTaken = async (username: string, excludeId?: string) => {
  const where: any = { username };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return !!(await db.Admin.findOne({ where, paranoid: false }));
};

const emailTaken = async (email: string, excludeId?: string) => {
  const where: any = { email: { [Op.iLike]: email } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return !!(await db.Admin.findOne({ where }));
};

async function createStaff(req: Request, res: Response, next: NextFunction) {
  const transaction = await db.sequelize.transaction();
  try {
    const {
      name,
      email,
      username,
      password,
      all_watches = false,
      device_ids = [],
    } = req.body;

    if (await usernameTaken(username)) {
      await transaction.rollback();
      return errorMessage(res, "Username already exists");
    }

    if (await emailTaken(email)) {
      await transaction.rollback();
      return errorMessage(res, "Email already exists");
    }

    if (!all_watches && device_ids.length) {
      const deviceError = await validateDeviceIds(device_ids);
      if (deviceError) {
        await transaction.rollback();
        return errorMessage(res, deviceError);
      }
    }

    const staff = await db.Admin.create(
      {
        name,
        email,
        username,
        password,
        role: "staff",
        all_watches,
        status: "active",
      },
      { transaction }
    );

    if (!all_watches) {
      await setAssignedDevices(staff.id, device_ids, transaction);
    }

    await transaction.commit();

    const created = await findStaffWithDevices(staff.id);
    return successMessage(res, "Staff created successfully", created);
  } catch (err) {
    await transaction.rollback();
    console.error("createStaff error:", err);
    return errorMessage(res, "Error creating staff");
  }
}

async function updateStaff(req: Request, res: Response, next: NextFunction) {
  const transaction = await db.sequelize.transaction();
  try {
    const { id, name, email, username, password, all_watches, device_ids } =
      req.body;

    const staff = await db.Admin.findOne({ where: { id, role: "staff" } });
    if (!staff) {
      await transaction.rollback();
      return errorMessage(res, "Staff not found");
    }

    if (username !== undefined && username !== staff.username) {
      if (await usernameTaken(username, id)) {
        await transaction.rollback();
        return errorMessage(res, "Username already exists");
      }
      staff.username = username;
    }

    if (email !== undefined && email !== staff.email) {
      if (await emailTaken(email, id)) {
        await transaction.rollback();
        return errorMessage(res, "Email already exists");
      }
      staff.email = email;
    }

    if (name !== undefined) staff.name = name;
    if (password) staff.password = password; // hashed by the model hook
    if (all_watches !== undefined) staff.all_watches = all_watches;

    if (device_ids !== undefined && device_ids.length) {
      const deviceError = await validateDeviceIds(device_ids);
      if (deviceError) {
        await transaction.rollback();
        return errorMessage(res, deviceError);
      }
    }

    await staff.save({ transaction });

    if (staff.all_watches) {
      // Full access makes specific assignments meaningless.
      await setAssignedDevices(staff.id, [], transaction);
    } else if (device_ids !== undefined) {
      await setAssignedDevices(staff.id, device_ids, transaction);
    }

    await transaction.commit();

    const updated = await findStaffWithDevices(staff.id);
    return successMessage(res, "Staff updated successfully", updated);
  } catch (err) {
    await transaction.rollback();
    console.error("updateStaff error:", err);
    return errorMessage(res, "Error updating staff");
  }
}

async function updateStaffStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, status } = req.body;

    const staff = await db.Admin.findOne({ where: { id, role: "staff" } });
    if (!staff) {
      return errorMessage(res, "Staff not found");
    }

    staff.status = status;
    await staff.save();

    return successMessage(res, "Staff status updated successfully", {
      id: staff.id,
      status: staff.status,
    });
  } catch (err) {
    console.error("updateStaffStatus error:", err);
    return errorMessage(res, "Error updating staff status");
  }
}

async function deleteStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;

    const staff = await db.Admin.findOne({ where: { id, role: "staff" } });
    if (!staff) {
      return errorMessage(res, "Staff not found");
    }

    await staff.destroy(); // soft delete (paranoid)

    return successMessage(res, "Staff deleted successfully");
  } catch (err) {
    console.error("deleteStaff error:", err);
    return errorMessage(res, "Error deleting staff");
  }
}

async function listStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      status = "",
    } = body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { role: "staff" };

    if (search) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (status) {
      whereCondition.status = status;
    }

    const { count, rows } = await db.Admin.findAndCountAll({
      where: whereCondition,
      attributes: STAFF_ATTRIBUTES,
      include: [ASSIGNED_DEVICES_INCLUDE],
      distinct: true,
      order: [["createdAt", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Staff fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("listStaff error:", err);
    return errorMessage(res, "Error fetching staff");
  }
}

async function getStaffDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.body;

    const staff = await findStaffWithDevices(id);
    if (!staff) {
      return errorMessage(res, "Staff not found");
    }

    return successMessage(res, "Staff fetched successfully", staff);
  } catch (err) {
    console.error("getStaffDetail error:", err);
    return errorMessage(res, "Error fetching staff");
  }
}

async function getCurrentStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const staffId = (req as any).user?.id;

    if (!staffId) {
      return errorMessage(res, "Staff not authenticated");
    }

    const staff = await findStaffWithDevices(staffId);
    if (!staff) {
      return errorMessage(res, "Staff not found");
    }

    return successMessage(res, "Staff profile fetched successfully", staff);
  } catch (err) {
    console.error("getCurrentStaff error:", err);
    return errorMessage(res, "Error fetching staff profile");
  }
}

async function updateCurrentStaff(req: Request, res: Response, next: NextFunction) {
  const transaction = await db.sequelize.transaction();
  try {
    const staffId = (req as any).user?.id;
    const { name, email, username, device_ids } = req.body;

    if (!staffId) {
      await transaction.rollback();
      return errorMessage(res, "Staff not authenticated");
    }

    const staff = await db.Admin.findOne({ where: { id: staffId, role: "staff" } });
    if (!staff) {
      await transaction.rollback();
      return errorMessage(res, "Staff not found");
    }

    if (username !== undefined && username !== staff.username) {
      if (await usernameTaken(username, staffId)) {
        await transaction.rollback();
        return errorMessage(res, "Username already exists");
      }
      staff.username = username;
    }

    if (email !== undefined && email !== staff.email) {
      if (await emailTaken(email, staffId)) {
        await transaction.rollback();
        return errorMessage(res, "Email already exists");
      }
      staff.email = email;
    }

    if (name !== undefined) staff.name = name;
    // if (password) {
    //   const bcrypt = require("bcrypt");
    //   staff.password = await bcrypt.hash(password, 10);
    // }

    if (device_ids !== undefined && device_ids.length) {
      const deviceError = await validateDeviceIds(device_ids);
      if (deviceError) {
        await transaction.rollback();
        return errorMessage(res, deviceError);
      }
    }

    await staff.save({ transaction });

    if (staff.all_watches) {
      // Full access makes specific assignments meaningless
      await setAssignedDevices(staff.id, [], transaction);
    } else if (device_ids !== undefined) {
      await setAssignedDevices(staff.id, device_ids, transaction);
    }

    await transaction.commit();

    const updated = await findStaffWithDevices(staff.id);
    return successMessage(res, "Staff profile updated successfully", updated);
  } catch (err) {
    await transaction.rollback();
    console.error("updateCurrentStaff error:", err);
    return errorMessage(res, "Error updating staff profile");
  }
}

// Staff login history: which staff logged in, from which IP, and when.
async function staffLoginLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const {
      staff_id = "",
      search = "",
      ip_address = "",
      from_date = "",
      to_date = "",
      page = 1,
      limit = 20,
      sorting = "DESC",
    } = body;

    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (staff_id) where.admin_id = staff_id;
    if (ip_address) where.ip_address = { [Op.iLike]: `%${ip_address}%` };
    if (from_date || to_date) {
      where.login_at = {};
      if (from_date) where.login_at[Op.gte] = new Date(from_date);
      if (to_date) {
        const end = new Date(to_date);
        // A plain date means "through the end of that day".
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(to_date))) {
          end.setUTCHours(23, 59, 59, 999);
        }
        where.login_at[Op.lte] = end;
      }
    }

    const staffWhere: any = { role: "staff" };
    if (search) {
      staffWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await db.AdminLoginLog.findAndCountAll({
      where,
      attributes: ["id", "admin_id", "ip_address", "user_agent", "login_at"],
      include: [
        {
          model: db.Admin,
          as: "Admin",
          where: staffWhere,
          attributes: ["id", "name", "email", "username", "status", "deletedAt"],
          required: true,
          paranoid: false, // keep history of deleted staff visible
        },
      ],
      order: [["login_at", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Staff login logs fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("staffLoginLogs error:", err);
    return errorMessage(res, "Error fetching staff login logs");
  }
}

export default {
  createStaff,
  updateStaff,
  updateStaffStatus,
  deleteStaff,
  listStaff,
  getStaffDetail,
  getCurrentStaff,
  updateCurrentStaff,
  staffLoginLogs,
};
