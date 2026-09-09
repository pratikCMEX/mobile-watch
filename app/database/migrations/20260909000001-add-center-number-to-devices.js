"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "center_number", {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
      comment: "Center phone number for SMS alarm alerts (CENTER command)",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "center_number");
  },
};
