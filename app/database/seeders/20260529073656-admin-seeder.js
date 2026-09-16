"use strict";

const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Hash the passwords for admin users
    const hashedPassword1 = await bcrypt.hash("123456", 10);
    const hashedPassword2 = await bcrypt.hash("admin123", 10);

    await queryInterface.bulkInsert(
      "Admins",
      [
        {
          id: uuidv4(),
          username: "VAG",
          password: hashedPassword1,
          email: "admin@mobile-watch.com",
          status: "active",
          session_token: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          username: "ADMIN2",
          password: hashedPassword2,
          email: "admin2@mobile-watch.com",
          status: "active",
          session_token: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Admins", { username: ["VAG", "ADMIN2"] }, {});
  },
};