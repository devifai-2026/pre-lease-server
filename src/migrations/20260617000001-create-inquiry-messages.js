"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("inquiry_messages", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      inquiry_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "property_inquiries", key: "id" },
        onDelete: "CASCADE",
      },
      sender_id: { type: Sequelize.UUID, allowNull: false },
      sender_type: { type: Sequelize.ENUM("dealer", "broker"), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.ENUM("pending", "approved", "denied"),
        allowNull: false,
        defaultValue: "approved",
      },
      edited_message: { type: Sequelize.TEXT, allowNull: true },
      reviewed_by: { type: Sequelize.UUID, allowNull: true },
      decline_reason: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    await queryInterface.addIndex("inquiry_messages", ["inquiry_id"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("inquiry_messages");
    // Drop the enums Postgres created for the table.
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_inquiry_messages_sender_type";'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_inquiry_messages_status";'
    );
  },
};
