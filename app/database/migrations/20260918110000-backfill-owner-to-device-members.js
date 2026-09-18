"use strict";

/**
 * Backfill DeviceMembers from Devices.owner_id.
 *
 * Multi-user-per-watch support relies on the DeviceMembers join table
 * being the single source of truth for "which users may use this
 * watch". Existing rows only ever set Devices.owner_id, so before this
 * migration a watch had no DeviceMember rows at all and would fall back
 * to the legacy owner_id everywhere.
 *
 * This migration copies every non-null Devices.owner_id into a
 * DeviceMember row (role = "admin") for that device, skipping rows that
 * already exist. It is idempotent and safe to re-run.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    const devices = await sequelize.query(
      `SELECT id, owner_id FROM "Devices" WHERE owner_id IS NOT NULL`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    let inserted = 0;
    let skipped = 0;
    for (const device of devices) {
      try {
        // findOrCreate-style upsert: skip if a row already exists.
        const [existing] = await sequelize.query(
          `SELECT id FROM "DeviceMembers"
           WHERE device_id = :device_id AND user_id = :user_id
           LIMIT 1`,
          {
            replacements: {
              device_id: device.id,
              user_id: device.owner_id,
            },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        if (existing && existing.id) {
          skipped += 1;
          continue;
        }

        await sequelize.query(
          `INSERT INTO "DeviceMembers" (id, device_id, user_id, role, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), :device_id, :user_id, 'admin', NOW(), NOW())`,
          {
            replacements: {
              device_id: device.id,
              user_id: device.owner_id,
            },
            type: Sequelize.QueryTypes.RAW,
          }
        );
        inserted += 1;
      } catch (err) {
        // Constraint violation / race — the row already exists, that's fine.
        skipped += 1;
      }
    }

    console.log(
      `[backfill-owner-to-device-members] processed ${devices.length} devices, inserted ${inserted}, skipped ${skipped}`
    );
  },

  async down(queryInterface, Sequelize) {
    // Intentionally a no-op: the backfilled rows are legitimate
    // ownership records and must not be dropped on rollback.
  },
};
