const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    auditId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    // What changed
    tableName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    recordId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    operation: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    // Field-level changes
    fieldName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    previousValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    updatedValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Who & When
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      // Foreign key managed by association in index.js
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    // Additional context
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    updatedAt: false, // ✅ Override: updatedAt is a data field, not auto-timestamp
  }
);

module.exports = AuditLog;
