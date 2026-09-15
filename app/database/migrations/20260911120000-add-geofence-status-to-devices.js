"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Tracks whether the device's last-known location was inside
    // ("in") or outside ("out") all of its active Geofence rows, so
    // the geofence check (tcpServer's cacheLatestLocationOnDevice)
    // can detect IN->OUT / OUT->IN transitions and only notify once
    // per transition instead of on every location update.
    await queryInterface.addColumn("Devices", "geofence_status", {
      type: Sequelize.STRING(10),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "geofence_status");
  },
};
