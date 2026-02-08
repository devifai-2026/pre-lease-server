const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const ApiLog = sequelize.define(
  "ApiLog",
  {
    logId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      // Foreign key managed by association in index.js
    },

    // Request Details
    httpMethod: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    endpoint: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    requestHeaders: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    requestBody: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    queryParams: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // Response Details
    responseStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    responseHeaders: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    responseBody: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // Client Context
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Performance
    requestTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    responseTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responseTimeMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // Error Tracking
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    stackTrace: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Additional Context
    sessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    environment: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
  },
  {
    tableName: "api_logs",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = ApiLog;
