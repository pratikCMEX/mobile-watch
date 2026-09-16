"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Admins", "name", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    // Existing rows are all full admins; staff are created through the
    // staff APIs with role = "staff".
    await queryInterface.addColumn("Admins", "role", {
      type: Sequelize.ENUM("admin", "staff"),
      allowNull: false,
      defaultValue: "admin",
    });
    // true = staff can access every watch, including watches added later.
    await queryInterface.addColumn("Admins", "all_watches", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("Admins", "deletedAt", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Admins", "deletedAt");
    await queryInterface.removeColumn("Admins", "all_watches");
    await queryInterface.removeColumn("Admins", "role");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Admins_role";'
    );
    await queryInterface.removeColumn("Admins", "name");
  },
};
