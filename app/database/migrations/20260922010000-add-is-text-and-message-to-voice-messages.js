"use strict";

/**
 * Adds is_text and message columns to the DeviceVoiceMessages table.
 *
 * - is_text: 1 = text-to-speech message, 0 = raw audio voice message
 * - message: optional text content used when is_text = 1 (TTS payload)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("DeviceVoiceMessages", "is_text", {
      type: Sequelize.INTEGER(1),
      allowNull: false,
      defaultValue: 0,
      comment: "1 = text-to-speech message, 0 = raw audio voice message",
    });

    await queryInterface.addColumn("DeviceVoiceMessages", "message", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Text content used when is_text = 1 (TTS payload)",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("DeviceVoiceMessages", "is_text");
    await queryInterface.removeColumn("DeviceVoiceMessages", "message");
  },
};
