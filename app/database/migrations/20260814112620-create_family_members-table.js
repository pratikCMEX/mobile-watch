"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("FamilyMembers", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      device_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Devices", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING, allowNull: false },
      mobile_no: { type: Sequelize.STRING(15), allowNull: false },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("now"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // await queryInterface.addIndex("family_members", ["device_id"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("FamilyMembers");
  },
};
