"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "language", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "timezone", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "language");
    await queryInterface.removeColumn("Devices", "timezone");
  },
};
