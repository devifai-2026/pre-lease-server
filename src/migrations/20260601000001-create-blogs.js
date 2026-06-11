"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("blogs", {
      blog_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      excerpt: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      author: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      read_time: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      is_featured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    await queryInterface.addIndex("blogs", ["slug"]);
    await queryInterface.addIndex("blogs", ["is_published", "published_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("blogs");
  },
};
