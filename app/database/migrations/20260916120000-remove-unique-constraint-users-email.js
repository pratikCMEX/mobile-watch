"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove the unique constraint on email column
    await queryInterface.removeConstraint("Users", "Users_email_key");

    // Add a partial unique index that only applies to active users (deletedAt IS NULL)
    await queryInterface.addIndex("Users", ["email"], {
      unique: true,
      name: "users_email_unique_active",
      where: {
        deletedAt: null,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the partial unique index
    await queryInterface.removeIndex("Users", "users_email_unique_active");

    // Add back the original unique constraint
    await queryInterface.addConstraint("Users", {
      fields: ["email"],
      type: "unique",
      name: "Users_email_key",
    });
  },
};
