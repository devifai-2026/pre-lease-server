"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Configurable enquiry pipeline stages
    await queryInterface.createTable("inquiry_stages", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING(60), allowNull: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_terminal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      color: { type: Sequelize.STRING(20), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // 2. Enquiry stage-change timeline
    await queryInterface.createTable("inquiry_status_history", {
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
      stage_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inquiry_stages", key: "id" },
      },
      stage_name: { type: Sequelize.STRING(60), allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      changed_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // 3. Current stage on the inquiry
    await queryInterface.addColumn("property_inquiries", "stage_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "inquiry_stages", key: "id" },
    });

    await queryInterface.addIndex("inquiry_status_history", ["inquiry_id"]);
    await queryInterface.addIndex("property_inquiries", ["stage_id"]);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("property_inquiries", "stage_id");
    await queryInterface.dropTable("inquiry_status_history");
    await queryInterface.dropTable("inquiry_stages");
  },
};
