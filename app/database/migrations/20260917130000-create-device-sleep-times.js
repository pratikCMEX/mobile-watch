"use strict";

/**
 * Stores the server-side mirror of the watch's sleep/body-tumbling
 * detection window (SLEEPTIME command).
 *
 * The protocol carries one time section per device, for example:
 *   SLEEPTIME,21:10-7:30
 *
 * The section may cross midnight (start > end). The original wire section
 * is retained for protocol compatibility, while start_time/end_time make
 * the window queryable without parsing strings in application code.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceSleepTimes", {
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
      time_section: {
        type: Sequelize.STRING(11),
        allowNull: true,
        defaultValue: null,
        comment:
          "Normalized HH:MM-HH:MM sleep detection window; NULL when disabled",
      },
      start_time: {
        type: Sequelize.STRING(5),
        allowNull: true,
        defaultValue: null,
        comment: "Window start in 24-hour HH:MM format",
      },
      end_time: {
        type: Sequelize.STRING(5),
        allowNull: true,
        defaultValue: null,
        comment: "Window end in 24-hour HH:MM format; may cross midnight",
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("DeviceSleepTimes", ["device_id"], {
      name: "devicesleeptimes_device_id_unique",
      unique: true,
    });

    await queryInterface.addIndex("DeviceSleepTimes", ["device_id"], {
      name: "devicesleeptimes_device_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("DeviceSleepTimes");
  },
};
