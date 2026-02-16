const express = require("express");
const rateLimit = require("express-rate-limit");
const userrouter = express.Router();
const {
  signup,
  login,
  logout,
  refreshAccessToken,
  switchRole,
  sendOtpHandler,
  verifyOtpHandler,
} = require("../controllers/user");
const { authenticateUser } = require("../middlewares/auth");

// ============================================
// RATE LIMITERS FOR AUTH ROUTES
// ============================================
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again after 15 minutes",
  },
});

const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window per IP (higher since it's automated)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh requests, please try again later",
  },
});

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
userrouter.post("/switch-role", authenticateUser, switchRole);

module.exports = userrouter;
