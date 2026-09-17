"use strict";

/**
 * Stores the server-side mirror of each watch alarm slot.
 *
 * Wire format: HH:MM-switch-type[-days]
 * - switch: 1 = enabled, 0 = disabled
 * - type: 1 = once, 2 = daily, 3 = weekly
 * - days: seven-character Sun-to-Sat mask, required only for weekly alarms
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceAlarms", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      device_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      slot_index: {
        type: Sequelize.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 3 },
        comment: "Watch alarm slot, 1-3",
      },
      alarm_time: {
        type: Sequelize.STRING(5),
        allowNull: false,
        comment: "24-hour alarm time in HH:MM format",
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Parsed from the alarm switch segment (1=on, 0=off)",
      },
      alarm_type: {
        type: Sequelize.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 3 },
        comment: "1=once, 2=daily, 3=weekly",
      },
      weekdays_mask: {
        type: Sequelize.STRING(7),
        allowNull: true,
        defaultValue: null,
        comment: "Seven-character Sun-to-Sat mask, used only by weekly alarms",
      },
      alarm_value: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: false,
        comment: "Original wire value, e.g. 08:10-1-3-0111110",
      },
      last_command_protocol: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      last_acked_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
    });

    await queryInterface.addIndex("DeviceAlarms", ["device_id", "slot_index"], {
      name: "devicealarms_device_id_slot_index_unique",
      unique: true,
    });

    await queryInterface.addIndex("DeviceAlarms", ["device_id"], {
      name: "devicealarms_device_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DeviceAlarms");
  },
};
