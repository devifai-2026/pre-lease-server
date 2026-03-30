"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("broker_profiles", {
      profile_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "users", key: "user_id" },
        onDelete: "CASCADE",
      },
      company_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      locality: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      specializations: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      deals_closed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("broker_profiles");
  },
};
