"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add the dynamic-state upload time interval (per the UPLOAD command)
    // to the DeviceSettings table. Stored in SECONDS to match the wire
    // protocol exactly. Allowed range: 60..65535 (validated in the API).
    await queryInterface.addColumn(
      "DeviceSettings",
      "upload_interval_seconds",
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "DeviceSettings",
      "upload_interval_seconds"
    );
  },
};
