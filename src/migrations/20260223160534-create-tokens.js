"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tokens", {
      token_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "user_id" },
        onDelete: "CASCADE",
      },
      refresh_token: {
        type: Sequelize.STRING(500),
        allowNull: false,
        unique: true,
      },
      device_id: { type: Sequelize.STRING(255) },
      user_agent: { type: Sequelize.TEXT },
      ip_address: { type: Sequelize.STRING(50) },
      issued_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      last_used_at: { type: Sequelize.DATE },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      revocation_reason: { type: Sequelize.STRING(100) },
      request_from: { type: Sequelize.STRING(100) },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("tokens");
  },
};
