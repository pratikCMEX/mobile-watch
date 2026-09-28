"use strict";

/**
 * Adds the columns required by the OTP based "forgot password" flow.
 *
 *  - otp_hash     : bcrypt hash of the 6 digit OTP (plain OTP is never stored)
 *  - otp_expiry   : timestamp after which the OTP is no longer valid
 *  - otp_attempts : failed verification attempts, cleared once the max is hit
 *  - reset_token  : short lived token handed out by /verifyOtp and consumed by
 *                   /changePassword (so the raw OTP is never re-sent by the app)
 *  - reset_token_expiry : expiry of the above reset token
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "Users";

    // Guard against re-running the migration on a DB that already has the columns.
    const existing = await queryInterface.describeTable(table);
    const has = (column) =>
      Object.prototype.hasOwnProperty.call(existing, column);

    if (!has("otp_hash")) {
      await queryInterface.addColumn(table, "otp_hash", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!has("otp_expiry")) {
      await queryInterface.addColumn(table, "otp_expiry", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!has("otp_attempts")) {
      await queryInterface.addColumn(table, "otp_attempts", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!has("reset_token")) {
      await queryInterface.addColumn(table, "reset_token", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!has("reset_token_expiry")) {
      await queryInterface.addColumn(table, "reset_token_expiry", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = "Users";
    const existing = await queryInterface.describeTable(table);
    const has = (column) =>
      Object.prototype.hasOwnProperty.call(existing, column);

    if (has("reset_token_expiry")) {
      await queryInterface.removeColumn(table, "reset_token_expiry");
    }
    if (has("reset_token")) {
      await queryInterface.removeColumn(table, "reset_token");
    }
    if (has("otp_attempts")) {
      await queryInterface.removeColumn(table, "otp_attempts");
    }
    if (has("otp_expiry")) {
      await queryInterface.removeColumn(table, "otp_expiry");
    }
    if (has("otp_hash")) {
      await queryInterface.removeColumn(table, "otp_hash");
    }
  },
};
