"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "Devices" ALTER COLUMN "owner_id" DROP NOT NULL'
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "Devices" ALTER COLUMN "owner_id" SET NOT NULL'
    );
  },
};
