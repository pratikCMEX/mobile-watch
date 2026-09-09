"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceSettings", "low_battery_alert", {
      type: Sequelize.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
      comment: "Low battery alarm SMS alert switch (1=ON, 0=OFF)",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceSettings", "low_battery_alert");
  },
};
