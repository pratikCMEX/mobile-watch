"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "DeviceSettings",
      "reject_stranger_enabled",
      {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "DeviceSettings",
      "reject_stranger_enabled"
    );
  },
};
