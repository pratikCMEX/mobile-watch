"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Devices", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onDelete: "CASCADE",
      },
      imei: { type: Sequelize.STRING, allowNull: false, unique: true },
      serial_number: { type: Sequelize.STRING, allowNull: true },
      device_name: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "Device",
      },
      email: { type: Sequelize.STRING, allowNull: false },
      phone_number: { type: Sequelize.STRING, allowNull: true },
      country_code: { type: Sequelize.STRING, allowNull: true },
      network_type: { type: Sequelize.STRING, allowNull: true }, // e.g. '2G', '4G', '5G'
      network_carrier: { type: Sequelize.STRING, allowNull: true },
      profile_image: { type: Sequelize.STRING, allowNull: true },
      connection_status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "offline",
      },
      signal_status: { type: Sequelize.STRING, allowNull: true },
      battery_percentage: { type: Sequelize.INTEGER, allowNull: true },
      gps_strength: { type: Sequelize.STRING, allowNull: true },
      is_online: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      last_updated_at: { type: Sequelize.DATE, allowNull: true },
      // interval for uploading location data, in minutes: 1 / 10 / 60 / 360 / 720
      location_interval_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      // wearer profile fields, needed for bphrt readings (height/gender/age/weight)
      height_cm: { type: Sequelize.INTEGER, allowNull: true },
      gender: { type: Sequelize.STRING, allowNull: true },
      age: { type: Sequelize.INTEGER, allowNull: true },
      weight_kg: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
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
    await queryInterface.dropTable("Devices");
  },
};
