"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Locations", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      device_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
      },
      latitude: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
      longitude: { type: Sequelize.DECIMAL(10, 7), allowNull: false },
      speed_kmh: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
      direction: { type: Sequelize.STRING, allowNull: true },
      address: { type: Sequelize.STRING, allowNull: true },
      total_distance_km: { type: Sequelize.DECIMAL(8, 2), allowNull: true },
      is_valid_fix: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      recorded_at: { type: Sequelize.DATE, allowNull: false },
      // deletedAt: {
      //   type: Sequelize.DATE,
      //   allowNull: true,
      //   defaultValue: null,
      // },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Locations");
  },
};
