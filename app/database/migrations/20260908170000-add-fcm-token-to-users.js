"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "fcm_token", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.sequelize.query(
      `COMMENT ON COLUMN "Users"."fcm_token" IS 'Firebase Cloud Messaging token for push notifications'`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Users", "fcm_token");
  },
};
