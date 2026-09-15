"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "server_host", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
      comment: "Pending server portal host (IP or URL) for device reconnection",
    });

    await queryInterface.addColumn("Devices", "server_port", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: "Pending server portal port for device reconnection",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "server_host");
    await queryInterface.removeColumn("Devices", "server_port");
  },
};
