"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("property_notification_event", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      property_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "properties", key: "property_id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "user_id" },
        onDelete: "CASCADE",
      },
      notification_text: { type: Sequelize.TEXT, allowNull: false },
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
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_deleted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    });

    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_property_notification_event_updated_at
        BEFORE UPDATE ON property_notification_event
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS update_property_notification_event_updated_at 
        ON property_notification_event;
    `);
    await queryInterface.dropTable("property_notification_event");
  },
};
