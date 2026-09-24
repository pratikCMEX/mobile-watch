"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceSettings", "step_target_achieved", {
      type: Sequelize.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
      comment:
        "Set to 1 when step target notification has been sent. Reset to 0 on the first step log of a new day, when steps go below target, or when the target changes.",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("DeviceSettings", "step_target_achieved");
  },
};
