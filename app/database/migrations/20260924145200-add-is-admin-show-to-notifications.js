"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // When an alert event is fanned out to every DeviceMember of a watch,
    // one Notification row is created per recipient. Only the first row
    // should surface on the admin dashboard; the rest are kept so each
    // member still gets their own FCM push and read-state, but the admin
    // panel shows the alert exactly once.
    //
    // is_admin_show = 1 -> visible on the admin dashboard alert list
    // is_admin_show = 0 -> hidden from the admin list (still delivered to
    //                      the watch member)
    await queryInterface.addColumn("Notifications", "is_admin_show", {
      type: Sequelize.ENUM("0", "1"),
      allowNull: false,
      defaultValue: "0",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Notifications", "is_admin_show");
  },
};
