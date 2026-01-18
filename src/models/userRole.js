const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/dbConnection');

const UserRole = sequelize.define(
  'UserRole',
  {
    userId: {
      type: DataTypes.UUID,
      field: 'user_id',
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'user_id',
      },
      onDelete: 'CASCADE',
    },
    roleName: {
      type: DataTypes.STRING(20),
      allowNull: false,
      primaryKey: true,
      validate: {
        isIn: [['investor', 'broker', 'owner', 'admin']],
      },
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'user_roles',
    timestamps: false,
  }
);

module.exports = UserRole;
