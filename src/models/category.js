const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

// Explore-Categories cards shown on the consumer homepage. Previously the
// title + image were hardcoded in the app; they are now admin-managed rows.
const Category = sequelize.define(
  "Category",
  {
    categoryId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    // Card heading, e.g. "Residential".
    title: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    // propertyType the "Explore" button filters by (usually === title, but the
    // admin can point a card at a different filter value).
    value: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    // Single Cloudinary image URL (max 1 image, replace-only).
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Display order on the homepage (ascending).
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "categories",
    timestamps: true,
    underscored: true,
  }
);

module.exports = Category;
