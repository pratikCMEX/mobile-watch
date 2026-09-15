"use strict";

const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Hash the password for admin user
    const hashedPassword = await bcrypt.hash("123456", 10);

    await queryInterface.bulkInsert(
      "Admins",
      [
        {
          id: uuidv4(),
          username: "VAG",
          password: hashedPassword,
          email: "admin@mobile-watch.com",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Admins", { username: "VAG" }, {});
  },
};