"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // A user may be supervised by at most one staff member. The column is
    // nullable because users created by an admin (role = "admin") or via the
    // public signup flow have no staff assignment. When the row that owns the
    // staff is removed the assignment is cleared rather than cascaded, so the
    // user simply becomes unassigned.
    await queryInterface.addColumn("Users", "assigned_staff_id", {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: { model: "Admins", key: "id" },
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Users", "assigned_staff_id");
  },
};
