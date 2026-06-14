"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("contact_leads", {
      lead_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Nullable: a logged-in user is linked; a guest submission is not.
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "user_id" },
        onDelete: "SET NULL",
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      role: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "open", // open | in_progress | resolved
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
    await queryInterface.addIndex("contact_leads", ["status", "created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("contact_leads");
  },
};
