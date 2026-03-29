"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add is_verified to users
    await queryInterface.addColumn("users", "is_verified", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    // 2. Make property_id nullable in property_notification_event
    await queryInterface.changeColumn("property_notification_event", "property_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "properties", key: "property_id" },
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove is_verified from users
    await queryInterface.removeColumn("users", "is_verified");

    // 2. Revert property_id to NOT NULL in property_notification_event
    // Note: This might fail if there are records with NULL property_id
    await queryInterface.changeColumn("property_notification_event", "property_id", {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "properties", key: "property_id" },
      onDelete: "CASCADE",
    });
  },
};
