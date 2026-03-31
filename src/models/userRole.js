const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const UserRole = sequelize.define(
  "UserRole",
  {
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      // Foreign key managed by association in index.js
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      // Foreign key managed by association in index.js
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      // Foreign key managed by association in index.js
    },
    assignedReason: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "assigned_reason",
    },
  },
  {
    tableName: "user_roles",
    timestamps: false, // ✅ Override: No timestamps
  }
);

module.exports = UserRole;
