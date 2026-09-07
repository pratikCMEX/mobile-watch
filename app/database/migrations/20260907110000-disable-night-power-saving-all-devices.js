"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Set night_power_saving to "0" (OFF) for all existing devices
    await queryInterface.sequelize.query(`
      UPDATE "DeviceSettings"
      SET "night_power_saving" = '0'
      WHERE "night_power_saving" != '0' OR "night_power_saving" IS NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // This migration sets all devices to night_power_saving = OFF
    // There's no down operation as we don't know the previous values
  },
};
