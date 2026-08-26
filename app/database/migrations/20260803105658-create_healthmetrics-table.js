"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("HealthMetrics", {
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
      metric_type: {
        type: Sequelize.ENUM(
          "heart_rate",
          "blood_pressure",
          "sleep",
          "spo2",
          "calories",
          "temperature",
          "distance",
          "steps_daily",
          "steps_cumulative"
        ),
        allowNull: false,
      },
      value_primary: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      value_secondary: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      unit: { type: Sequelize.STRING, allowNull: true },
      recorded_at: { type: Sequelize.DATE, allowNull: false },
      // deletedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("HealthMetrics");
  },
};
