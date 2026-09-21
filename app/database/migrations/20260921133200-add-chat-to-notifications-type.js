"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'chat'`
    );
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing individual enum values.
  },
};
