"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceSettings", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      device_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true, // one settings row per device
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
      },
      sms_alert_enabled: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      take_off_device_alert: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      safe_mode: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      talking_clock: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      night_power_saving: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      volume: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      brightness: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50,
      },
      fall_down_alert_enabled: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      fall_down_reminder_call: {
        type: Sequelize.ENUM("1", "0"),
        allowNull: true,
        defaultValue: "0",
      },
      fall_down_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
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
    await queryInterface.dropTable("DeviceSettings");
  },
};
