const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const SupportRequest = sequelize.define(
  "SupportRequest",
  {
    requestId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "open",
    },
  },
  {
    tableName: "support_requests",
    timestamps: true,
    underscored: true,
  }
);

module.exports = SupportRequest;
