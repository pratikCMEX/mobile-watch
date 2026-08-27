"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });

    await queryInterface.changeColumn("Devices", "email", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Devices", "owner_id", {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "Users", key: "id" },
      onDelete: "CASCADE",
    });

    await queryInterface.changeColumn("Devices", "email", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
