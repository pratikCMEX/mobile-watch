"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("StaffDevices", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      staff_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      device_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("StaffDevices", ["staff_id", "device_id"], {
      unique: true,
      name: "staff_devices_staff_id_device_id_unique",
    });
    await queryInterface.addIndex("StaffDevices", ["device_id"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("StaffDevices");
  },
};
