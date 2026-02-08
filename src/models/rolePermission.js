const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const RolePermission = sequelize.define(
  "RolePermission",
  {
    roleId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      // Foreign key managed by association in index.js
    },
    permissionId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      // Foreign key managed by association in index.js
    },
    grantedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    grantedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      // Foreign key managed by association in index.js
    },
  },
  {
    tableName: "role_permissions",
    timestamps: false, // ✅ Override: No timestamps
  }
);

module.exports = RolePermission;
