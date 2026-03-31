"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. users — add join_type and is_guest
    await queryInterface.addColumn("users", "join_type", {
      type: Sequelize.ENUM("investor", "broker"),
      allowNull: true, // nullable for existing users / admin users
    });

    await queryInterface.addColumn("users", "is_guest", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // 2. user_roles — add assigned_reason
    await queryInterface.addColumn("user_roles", "assigned_reason", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    // 3. property_inquiries — add inquirer_role_type
    await queryInterface.addColumn("property_inquiries", "inquirer_role_type", {
      type: Sequelize.ENUM("investor", "broker"),
      allowNull: true,
      defaultValue: "investor",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("property_inquiries", "inquirer_role_type");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_property_inquiries_inquirer_role_type";'
    );

    await queryInterface.removeColumn("user_roles", "assigned_reason");

    await queryInterface.removeColumn("users", "is_guest");
    await queryInterface.removeColumn("users", "join_type");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_join_type";'
    );
  },
};
