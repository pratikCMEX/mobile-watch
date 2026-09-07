"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Cache the most recent GPS fix on the Device row so the
    // dashboard can render the "current location" without scanning
    // the entire Locations history every page load.
    //
    // These are refreshed by the tcpServer's existing location
    // handlers (handleLocation / saveLteLocation) AND read back by
    // GET /user/device/location.
    await queryInterface.addColumn("Devices", "latest_lat", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Devices", "latest_lng", {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Devices", "latest_location_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Devices", "latest_location_is_valid", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "latest_location_is_valid");
    await queryInterface.removeColumn("Devices", "latest_location_at");
    await queryInterface.removeColumn("Devices", "latest_lng");
    await queryInterface.removeColumn("Devices", "latest_lat");
  },
};
