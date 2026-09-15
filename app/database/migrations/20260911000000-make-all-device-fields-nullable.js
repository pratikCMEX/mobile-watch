"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make every Device column nullable so a device can be registered
    // with only an IMEI (or only a serial_number) and every other
    // field can be filled in later by the watch itself.
    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });
    await queryInterface.changeColumn("Devices", "imei", {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });
    await queryInterface.changeColumn("Devices", "serial_number", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "device_name", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: "Device",
    });
    await queryInterface.changeColumn("Devices", "email", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "phone_number", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "country_code", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "network_type", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "network_carrier", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "profile_image", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.changeColumn("Devices", "connection_status", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: "offline",
    });
    await queryInterface.changeColumn("Devices", "signal_status", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "battery_percentage", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "gps_strength", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "is_online", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    });
    await queryInterface.changeColumn("Devices", "last_updated_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "location_interval_minutes", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "height_cm", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "gender", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "age", {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.changeColumn("Devices", "weight_kg", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    // Re-apply the original NOT NULL constraints.
    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });
    await queryInterface.changeColumn("Devices", "imei", {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    });
    await queryInterface.changeColumn("Devices", "device_name", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "Device",
    });
    await queryInterface.changeColumn("Devices", "email", {
      type: Sequelize.STRING,
      allowNull: false,
    });
    await queryInterface.changeColumn("Devices", "connection_status", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "offline",
    });
    await queryInterface.changeColumn("Devices", "is_online", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.changeColumn("Devices", "location_interval_minutes", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
  },
};
