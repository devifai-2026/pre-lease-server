const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const Amenity = sequelize.define(
  "Amenity",
  {
    amenityId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    amenityName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "amenities",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = Amenity;
