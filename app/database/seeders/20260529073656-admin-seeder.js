"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Note: Password should be properly hashed before insertion
    // This is a placeholder that should be updated with actual hashed password
    await queryInterface.bulkInsert(
      "Users",
      [
        {
          id: Sequelize.UUIDV4,
          role: "admin",
          full_name: "Admin User",
          email: "admin@rezzerv.com",
          mobile_no: "1234567890",
          password: "$2b$10$placeholder_hashed_password", // Replace with actual bcrypt hash
          country_code: "+1",
          status: "1",
          is_exists: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Users", { email: "admin@rezzerv.com" }, {});
  },
};