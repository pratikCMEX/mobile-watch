"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Reminders", {
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
      type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "general",
        comment: "pill | water | general | sedentary",
      },
      reminder_settings: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "time-switch-frequency-custom, e.g. 11:25-1-2",
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "1-3, which reminder slot (up to 3 reminders max)",
      },
      reminder_text: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Unicode hex-encoded reminder text, e.g. 006f00770070006d0067",
      },
      voice_data: {
        type: Sequelize.BLOB,
        allowNull: true,
        comment: "Optional AMR audio data (binary)",
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_command_protocol: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Last TAKEPILLS command sent to device",
      },
      last_acked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
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
    await queryInterface.dropTable("Reminders");
  },
};
