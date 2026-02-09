// models/auditLog.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

/**
 * AuditLog Model
 *
 * Tracks all data modifications (INSERT, UPDATE, DELETE) across the system
 * Stores both old and new values for compliance and recovery purposes
 *
 * Usage Pattern:
 * - INSERT: oldValue = null, newValue = full new record
 * - UPDATE: oldValue = changed fields before, newValue = changed fields after
 * - DELETE: oldValue = full record before deletion, newValue = null
 */
const AuditLog = sequelize.define(
  "AuditLog",
  {
    auditLogId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // ============================================
    // WHO - User who performed the action
    // ============================================
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      // Foreign key association defined in models/index.js
    },

    // ============================================
    // WHAT - Type of operation performed
    // ============================================
    operation: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Type of operation: INSERT, UPDATE, DELETE",
    },

    // ============================================
    // WHICH - Entity identification
    // ============================================
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: "Type of entity modified (Property, User, etc.)",
    },

    recordId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID of the affected record (property_id, user_id, etc.)",
      // Foreign key association defined in models/index.js
    },

    // ============================================
    // STATE - Before and after values
    // ============================================
    oldValue: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Previous state (NULL for INSERT operations)",
    },

    newValue: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "New state (NULL for DELETE operations)",
    },

    // ============================================
    // METADATA - Additional context
    // ============================================
    tableName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Database table name (properties, users, etc.)",
    },

    ipAddress: {
      type: DataTypes.INET,
      allowNull: true,
    },

    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    updatedAt: false, // Audit logs are immutable (never updated)
  }
);

module.exports = AuditLog;
