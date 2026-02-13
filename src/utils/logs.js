const { ApiLog, AuditLog } = require("../models/index");
const asyncHandler = require("./asyncHandler");
//this should be in mongoDB
// ============================================
// HELPER: Log API Request (Success or Failure)
// ============================================
const logRequest = asyncHandler((req, responseData, startTime, next) => {
  return (async () => {
    try {
      const endTime = Date.now();
      await ApiLog.create({
        userId: responseData.userId || null,
        httpMethod: req.method,
        endpoint: req.originalUrl || req.url,
        requestHeaders: req.headers,
        requestBody: responseData.requestBodyLog || null, // Pre-redacted body
        queryParams: req.query,
        responseStatus: responseData.status,
        responseBody: responseData.body,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestTimestamp: new Date(startTime),
        responseTimestamp: new Date(endTime),
        responseTimeMs: endTime - startTime,
        errorMessage: responseData.error || null,
        stackTrace: responseData.stackTrace || null,
        environment: process.env.NODE_ENV || "development",
      });
    } catch (err) {
      // Never fail request due to logging error
      console.error("❌ API log failed:", err.message);
    }
  })().catch((e) => {
    // Safety: if anything escapes, don't crash signup/login
    if (typeof next === "function") return next(e);
  });
});

/**
 * Utility functions for creating audit log entries
 * Follows the pattern:
 * - INSERT: oldValue = null, newValue = full new record
 * - UPDATE: oldValue = changed fields, newValue = changed fields
 * - DELETE: oldValue = full record snapshot, newValue = null
 */

const logInsert = async ({
  userId,
  entityType,
  recordId,
  newRecord,
  tableName,
  ipAddress,
  userAgent,
  transaction,
}) => {
  return await AuditLog.create(
    {
      userId,
      operation: "INSERT",
      entityType,
      recordId,
      oldValue: null, // ✅ No previous state for INSERT
      newValue: newRecord, // ✅ Full new record
      tableName,
      ipAddress,
      userAgent,
    },
    { transaction }
  );
};

const logUpdate = async ({
  userId,
  entityType,
  recordId,
  oldValues,
  newValues,
  tableName,
  ipAddress,
  userAgent,
  transaction,
}) => {
  const { AuditLog } = require("../models");

  return await AuditLog.create(
    {
      userId,
      operation: "UPDATE",
      entityType,
      recordId,
      oldValue: oldValues, // ✅ Previous state (only changed fields)
      newValue: newValues, // ✅ New state (only changed fields)
      tableName,
      ipAddress,
      userAgent,
    },
    { transaction }
  );
};

const logDelete = async ({
  userId,
  entityType,
  recordId,
  oldRecord,
  tableName,
  ipAddress,
  userAgent,
  transaction,
}) => {
  const { AuditLog } = require("../models");

  return await AuditLog.create(
    {
      userId,
      operation: "DELETE",
      entityType,
      recordId,
      oldValue: oldRecord, // ✅ Full record snapshot before deletion
      newValue: null, // ✅ No new state (deleted)
      tableName,
      ipAddress,
      userAgent,
    },
    { transaction }
  );
};

/**
 * Helper: Build old/new values for UPDATE operation
 * Compares oldRecord with updateData and extracts only changed fields
 * @param {Object} oldRecord - Complete record before update
 * @param {Object} updateData - Fields being updated
 * @returns {Object} { oldValues, newValues } - Only changed fields
 */
const buildUpdateValues = (oldRecord, updateData) => {
  const oldValues = {};
  const newValues = {};

  Object.keys(updateData).forEach((field) => {
    // Only include if value actually changed
    if (oldRecord[field] !== updateData[field]) {
      oldValues[field] = oldRecord[field];
      newValues[field] = updateData[field];
    }
  });

  return { oldValues, newValues };
};

module.exports = {
  logRequest,
  logInsert,
  logUpdate,
  logDelete,
  buildUpdateValues,
};
