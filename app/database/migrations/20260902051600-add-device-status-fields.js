"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "firmware_version", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "language", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "timezone", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "heartbeat_interval_seconds", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "wifi_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn("Devices", "wifi_connected", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn("Devices", "gprs_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn("Devices", "gps_status", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Devices", "network_status", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "firmware_version");
    await queryInterface.removeColumn("Devices", "language");
    await queryInterface.removeColumn("Devices", "timezone");
    await queryInterface.removeColumn("Devices", "heartbeat_interval_seconds");
    await queryInterface.removeColumn("Devices", "wifi_enabled");
    await queryInterface.removeColumn("Devices", "wifi_connected");
    await queryInterface.removeColumn("Devices", "gprs_enabled");
    await queryInterface.removeColumn("Devices", "gps_status");
    await queryInterface.removeColumn("Devices", "network_status");
  },
};
