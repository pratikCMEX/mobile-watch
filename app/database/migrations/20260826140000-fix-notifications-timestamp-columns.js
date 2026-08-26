"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      "Notifications",
      "created_at",
      "createdAt"
    );
    await queryInterface.renameColumn(
      "Notifications",
      "updated_at",
      "updatedAt"
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "Notifications",
      "createdAt",
      "created_at"
    );
    await queryInterface.renameColumn(
      "Notifications",
      "updatedAt",
      "updated_at"
    );
  },
};
