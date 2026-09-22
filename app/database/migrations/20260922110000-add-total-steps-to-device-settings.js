"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceSettings", "total_steps", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment:
        "Latest cumulative step count synced from HealthMetrics (steps_cumulative). Refreshed on every location fix so the live dashboard always shows the current total.",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceSettings", "total_steps");
  },
};
