"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("property_amenities", {
      property_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "properties", key: "property_id" },
        onDelete: "CASCADE",
      },
      amenity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "amenities", key: "amenity_id" },
        onDelete: "CASCADE",
      },
      added_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.createTable("property_certifications", {
      property_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: "properties", key: "property_id" },
        onDelete: "CASCADE",
      },
      certification_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        primaryKey: true,
      },
      certification_details: { type: Sequelize.TEXT },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.createTable("property_connectivity", {
      connectivity_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      property_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "properties", key: "property_id" },
        onDelete: "CASCADE",
      },
      connectivity_type: { type: Sequelize.STRING(50) },
      name: { type: Sequelize.STRING(200) },
      distance_km: { type: Sequelize.DECIMAL(10, 2) },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.createTable("property_media", {
      media_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      property_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "properties", key: "property_id" },
        onDelete: "CASCADE",
      },
      media_type: { type: Sequelize.STRING(20) },
      file_url: { type: Sequelize.TEXT, allowNull: false },
      uploaded_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("property_media");
    await queryInterface.dropTable("property_connectivity");
    await queryInterface.dropTable("property_certifications");
    await queryInterface.dropTable("property_amenities");
  },
};
