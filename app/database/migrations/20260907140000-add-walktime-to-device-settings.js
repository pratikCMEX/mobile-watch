"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add the pedometer / step-counting "walktime" feature. The
    // device ships with this feature OFF; users must send a
    // WALKTIME command to switch the pedometer ON for any desired
    // time window.
    //
    //   walk_time_enabled  – whether the pedometer is currently ON
    //   walk_time_sections – JSON array of up to 3 HH:MM-HH:MM
    //                        strings; an empty array means OFF.
    await queryInterface.addColumn("DeviceSettings", "walk_time_enabled", {
      type: Sequelize.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    });
    await queryInterface.addColumn("DeviceSettings", "walk_time_sections", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    // Also track the daily physical-step target so the app can show
    // progress without needing to call out to the watch.
    await queryInterface.addColumn("DeviceSettings", "walk_time_step_target", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: {
        min: 0,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "DeviceSettings",
      "walk_time_step_target"
    );
    await queryInterface.removeColumn("DeviceSettings", "walk_time_sections");
    await queryInterface.removeColumn("DeviceSettings", "walk_time_enabled");
  },
};
