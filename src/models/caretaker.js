const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const Caretaker = sequelize.define(
  "Caretaker",
  {
    caretakerId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    caretakerName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    caretakerType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    contactInfo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "caretakers",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = Caretaker;
