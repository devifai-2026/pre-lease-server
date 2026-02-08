const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const Role = sequelize.define(
  "Role",
  {
    roleId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    roleName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    roleType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["client", "admin"]],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "roles",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = Role;
