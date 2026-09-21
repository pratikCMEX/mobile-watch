"use strict";

/**
 * Stores voice messages sent to devices via the send_voice_message API.
 *
 * - device_id: links to the Devices table
 * - is_send: 1 = sent via API (send_voice_message), 0 = not from API
 * - status: device ACK — "1" success, "0" failure, null = pending
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceVoiceMessages", {
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
      voice_data: {
        type: Sequelize.BLOB,
        allowNull: true,
        comment: "Raw AMR audio buffer",
      },
      voice_file_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: "Original uploaded file name",
      },
      is_send: {
        type: Sequelize.INTEGER(1),
        allowNull: false,
        defaultValue: 1,
        comment: "1 = sent via API, 0 = not from API",
      },
      status: {
        type: Sequelize.STRING(1),
        allowNull: true,
        defaultValue: null,
        comment: "Device ACK: 1=success, 0=failure, null=pending",
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

    await queryInterface.addIndex("DeviceVoiceMessages", ["device_id"], {
      name: "devicevoicemessages_device_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DeviceVoiceMessages");
  },
};
