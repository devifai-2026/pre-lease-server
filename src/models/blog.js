const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const Blog = sequelize.define(
  "Blog",
  {
    blogId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    excerpt: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    author: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    readTime: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "blogs",
    timestamps: true,
    underscored: true,
  }
);

module.exports = Blog;
