const express = require("express");
const rateLimit = require("express-rate-limit");
const userrouter = express.Router();
const {
  signup,
  login,
  logout,
  refreshAccessToken,
  sendOtpHandler,
  verifyOtpHandler,
  getClientUsers,
  changeMobileNumber,
  getAvailableRoles,
  switchRole,
} = require("../controllers/user");
const { authenticateUser } = require("../middlewares/auth");

// ============================================
// RATE LIMITERS FOR AUTH ROUTES
// ============================================
// Rate limiting is currently DISABLED on auth routes (no-op) so legitimate
// users aren't throttled during OTP resends / retries. To re-enable, restore
// the rateLimit() config below and gate it on `!isDevelopment`.
const noopLimiter = (req, res, next) => next();
const isDevelopment = process.env.NODE_ENV === "development";

const authRateLimiter = noopLimiter;
const refreshRateLimiter = noopLimiter;

// ============================================
// PUBLIC ROUTES (No Authentication Required)
// ============================================

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send OTP to mobile number via MessageCentral
 * @access  Public
 */
userrouter.post("/send-otp", authRateLimiter, sendOtpHandler);
userrouter.post("/verify-otp", authRateLimiter, verifyOtpHandler);

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Register new user with OTP verification
 * @access  Public
 */
userrouter.post("/signup", authRateLimiter, signup);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user with mobile number and OTP
 * @access  Public
 */
userrouter.post("/login", authRateLimiter, login);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user by revoking refresh token
 * @access  Public (requires valid refresh token in header)
 * @header  Authorization: Bearer <refreshToken>
 */
userrouter.post("/logout", logout);

/**
 * @route   GET /api/v1/auth/refresh-token
 * @desc    Refresh access token using valid refresh token
 * @access  Public (requires valid refresh token in header)
 * @header  Authorization: Bearer <refreshToken>
 */
userrouter.get("/refresh-token", refreshRateLimiter, refreshAccessToken);
userrouter.get("/get-client-users", authenticateUser, getClientUsers);
userrouter.get("/available-roles", authenticateUser, getAvailableRoles);
userrouter.post("/switch-role", authenticateUser, switchRole);

// PATCH /api/users/change-mobile
userrouter.patch("/change-mobile", authenticateUser, changeMobileNumber);

module.exports = userrouter;
