const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyAmenity = sequelize.define(
  "PropertyAmenity",
  {
    propertyId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    amenityId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    addedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "property_amenities",
    timestamps: false, // ✅ Override: No timestamps
  }
);

module.exports = PropertyAmenity;
