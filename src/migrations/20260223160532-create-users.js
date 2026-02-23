"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      user_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      first_name: { type: Sequelize.STRING(100) },
      last_name: { type: Sequelize.STRING(100) },
      mobile_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      email: { type: Sequelize.STRING(255), unique: true },
      rera_number: { type: Sequelize.STRING(50), unique: true },
      user_type: { type: Sequelize.STRING(20), allowNull: false },
      otp: { type: Sequelize.STRING(6) },
      otp_expires_at: { type: Sequelize.DATE },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_login_at: { type: Sequelize.DATE },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE users ADD CONSTRAINT users_user_type_check 
        CHECK (user_type IN ('client','admin'));
    `);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
