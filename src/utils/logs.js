const { ApiLog } = require("../models/index");
const asyncHandler = require("./asyncHandler");

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

module.exports = { logRequest };
