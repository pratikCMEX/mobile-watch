"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceSettings", "dial_lock_enabled", {
      type: Sequelize.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    });
    await queryInterface.sequelize.query(
      `COMMENT ON COLUMN "DeviceSettings"."dial_lock_enabled" IS 'Watch dial plate lock (APPLOCK,PH-1=ON, PH-0=OFF)'`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceSettings", "dial_lock_enabled");
  },
};
