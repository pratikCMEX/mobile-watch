"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceSettings", "low_battery_alert", {
      type: Sequelize.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceSettings", "low_battery_alert");
  },
};
