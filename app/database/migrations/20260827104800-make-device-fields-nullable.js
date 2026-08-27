"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Devices", "imei", {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });

    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    // First, remove devices that have null imei or owner_id to avoid constraint violations
    await queryInterface.sequelize.query(
      'DELETE FROM "Devices" WHERE imei IS NULL OR owner_id IS NULL'
    );

    await queryInterface.changeColumn("Devices", "imei", {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    });

    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });
  },
};
