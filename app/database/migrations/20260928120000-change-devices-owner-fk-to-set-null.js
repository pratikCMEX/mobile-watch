"use strict";

/**
 * Stop deleting watches when their owner is deleted.
 *
 * "Devices"."owner_id" was created with ON DELETE CASCADE (see
 * 20260723093517-create_devices-table.js and every later changeColumn on that
 * column). Deleting a User row therefore removed every Device they owned, and
 * through the cascading keys on DeviceSettings / Locations / Notifications /
 * HealthMetrics / Snapshots / etc. all of that watch data with it.
 *
 * The watches are business records: removing the account must only unassign
 * them (owner_id -> NULL), leaving the rows in "Devices" so they can be
 * reassigned with /assign_device_to_user.
 *
 * The admin controller nulls owner_id before deleting the user; this migration
 * makes the database enforce the same rule for any other code path.
 *
 * Note: the repeated changeColumn() calls on this column (see
 * 20260827104800 / 20260827122000 / 20260911000000) left several duplicate FK
 * constraints behind (Devices_owner_id_fkey, ..._fkey1, ..._fkey2,
 * ..._fkey3), all with ON DELETE CASCADE. Every constraint found on the column
 * is dropped here and replaced by a single SET NULL constraint.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const constraints = await queryInterface.sequelize.query(
      `SELECT con.conname
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'Devices'
          AND con.contype = 'f'
          AND con.confdeltype <> 'a'
          AND con.conkey = ARRAY[
                (SELECT attnum FROM pg_attribute
                  WHERE attrelid = '"Devices"'::regclass AND attname = 'owner_id')
              ]::smallint[]`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const { conname } of constraints) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Devices" DROP CONSTRAINT "${conname}"`
      );
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE "Devices"
         ADD CONSTRAINT "Devices_owner_id_fkey"
         FOREIGN KEY ("owner_id") REFERENCES "Users"("id")
         ON DELETE SET NULL ON UPDATE CASCADE`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "Devices" DROP CONSTRAINT IF EXISTS "Devices_owner_id_fkey"`
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "Devices"
         ADD CONSTRAINT "Devices_owner_id_fkey"
         FOREIGN KEY ("owner_id") REFERENCES "Users"("id")
         ON DELETE CASCADE ON UPDATE CASCADE`
    );
  },
};
