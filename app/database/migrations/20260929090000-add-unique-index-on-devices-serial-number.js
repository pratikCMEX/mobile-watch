"use strict";

/**
 * Make "Devices"."serial_number" unique, and clean up the duplicate rows
 * that the TCP layer created because of it.
 *
 * The duplicate bug
 * -----------------
 * A watch that powers on for the first time sends ICCID/RYIMEI and its
 * normal data packets almost immediately. Both code paths in
 * tcpServer.ts tried to auto-register an unknown watch:
 *
 *   - findDevice()          -> INSERT (serial_number=deviceId, imei=NULL)
 *   - linkDeviceIdentity()  -> INSERT (serial_number=deviceId, imei=<real>)
 *
 * Both did a find-then-INSERT with no unique index to fall back on, and
 * findDevice()'s findOrCreate() was additionally keyed on
 * `{ serial_number, imei: null }` - so once linkDeviceIdentity() had
 * written the real IMEI onto the row, that predicate no longer matched
 * it and findOrCreate() judged the watch unregistered and inserted a
 * SECOND row for the same physical watch.
 *
 * The database could not object:
 *   - "serial_number" had no unique index.
 *   - The unique index on "imei" does not help, because PostgreSQL treats
 *     NULLs as distinct - any number of rows with imei=NULL and the same
 *     serial_number are accepted.
 *
 * What this migration does
 * ------------------------
 * 1. Merges existing duplicate serial_number groups into one row, keeping
 *    the most complete row (an assigned owner, then a known IMEI, then the
 *    most recent) and re-pointing every child table at it. Child tables
 *    are discovered from pg_constraint so this keeps working when tables
 *    are added, rather than hard-coding a list that goes stale.
 *
 * 2. Adds a partial unique index on serial_number. It is partial
 *    (WHERE serial_number IS NOT NULL) because a device may legitimately
 *    be registered with only an IMEI and no serial number yet - see
 *    20260911000000-make-all-device-fields-nullable.js.
 *
 * The application side of the same fix lives in tcpServer.ts:
 * findDevice() and linkDeviceIdentity() now share a per-device
 * registration lock and findOrCreate() is keyed on serial_number alone.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Every SELECT below must pass QueryTypes.SELECT. Without it
     * sequelize.query() resolves to [results, metadata] rather than the
     * rows, and the destructuring would silently read `undefined` fields
     * off the metadata object.
     */
    const SELECT = Sequelize.QueryTypes.SELECT;
    // ── 1. Merge duplicate serial_number rows ──────────────────────
    //
    // Run in one transaction: a child row must never point at a device
    // row that is being deleted.
    await queryInterface.sequelize.transaction(async (t) => {
      const duplicates = await queryInterface.sequelize.query(
        `SELECT "serial_number"
           FROM "Devices"
          WHERE "serial_number" IS NOT NULL
          GROUP BY "serial_number"
         HAVING COUNT(*) > 1`,
        { transaction: t, type: SELECT }
      );

      for (const { serial_number: serialNumber } of duplicates) {
        // Winner: owned > has IMEI > has a name > most recently updated.
        const rows = await queryInterface.sequelize.query(
          `SELECT "id"
             FROM "Devices"
            WHERE "serial_number" = :serialNumber
            ORDER BY ("owner_id" IS NOT NULL) DESC,
                     ("imei" IS NOT NULL) DESC,
                     ("device_name" IS NOT NULL) DESC,
                     "updatedAt" DESC,
                     "createdAt" DESC
            LIMIT 1`,
          {
            replacements: { serialNumber },
            transaction: t,
            type: SELECT,
          }
        );

        const keepId = rows[0]?.id;
        if (!keepId) continue;

        const losers = await queryInterface.sequelize.query(
          `SELECT "id"
             FROM "Devices"
            WHERE "serial_number" = :serialNumber AND "id" <> :keepId`,
          {
            replacements: { serialNumber, keepId },
            transaction: t,
            type: SELECT,
          }
        );

        for (const { id: loseId } of losers) {
          // Re-point every foreign key that currently targets the losing
          // row, before deleting it. Discovered from pg_constraint so new
          // tables are covered without editing this migration.
          const fks = await queryInterface.sequelize.query(
            `SELECT con.conname,
                    cl.relname AS child_table,
                    att.attname AS child_column
               FROM pg_constraint con
               JOIN pg_class cl ON cl.oid = con.conrelid
               JOIN pg_class parent ON parent.oid = con.confrelid
               JOIN pg_attribute att
                 ON att.attrelid = con.conrelid
                AND att.attnum = con.conkey[1]
              WHERE con.contype = 'f'
                AND con.confrelid = '"Devices"'::regclass`,
            { transaction: t, type: SELECT }
          );

          for (const fk of fks) {
            await queryInterface.sequelize.query(
              `UPDATE "${fk.child_table}"
                  SET "${fk.child_column}" = :keepId
                WHERE "${fk.child_column}" = :loseId`,
              { replacements: { keepId, loseId }, transaction: t }
            );
          }

          await queryInterface.sequelize.query(
            `DELETE FROM "Devices" WHERE "id" = :loseId`,
            { replacements: { loseId }, transaction: t }
          );
        }
      }
    });

    // ── 2. Enforce uniqueness going forward ────────────────────────
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Devices_serial_number_unique"
          ON "Devices" ("serial_number")
       WHERE "serial_number" IS NOT NULL`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "Devices_serial_number_unique"`
    );
  },
};
