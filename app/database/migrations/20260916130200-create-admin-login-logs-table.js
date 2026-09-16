"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("AdminLoginLogs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      },
      login_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("AdminLoginLogs", ["admin_id", "login_at"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("AdminLoginLogs");
  },
};
