"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Devices", "force_update", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "Whether the mobile app should be force-updated (true/false)",
    });

    await queryInterface.addColumn("Devices", "apk_version", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
      comment: "Minimum required APK/app version for the device",
    });

    await queryInterface.addColumn("Devices", "type", {
      type: Sequelize.ENUM("ios", "android"),
      allowNull: true,
      defaultValue: null,
      comment: "App platform type: ios or android",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Devices", "force_update");
    await queryInterface.removeColumn("Devices", "apk_version");
    await queryInterface.removeColumn("Devices", "type");
  },
};
