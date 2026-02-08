const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyConnectivity = sequelize.define(
  "PropertyConnectivity",
  {
    connectivityId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    connectivityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    distanceKm: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
  },
  {
    tableName: "property_connectivity",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = PropertyConnectivity;
