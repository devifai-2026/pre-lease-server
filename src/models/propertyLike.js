const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyLike = sequelize.define(
  "PropertyLike",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: "property_likes",
    timestamps: true, // Will create createdAt and updatedAt
  }
);

module.exports = PropertyLike;
