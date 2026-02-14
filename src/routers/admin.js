const express = require("express");
const router = express.Router();
const {
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
} = require("../controllers/admin");
const { authenticateUser, checkPermission } = require("../middlewares/auth");

// ============================================
// ADMIN USER MANAGEMENT ROUTES
// ============================================

/**
 * @route   POST /api/v1/admin/users
 * @desc    Create new admin user (Super Admin only)
 * @access  Private (USER_CREATE permission)
 */
router.post(
  "/users",
  authenticateUser,
  checkPermission("USER_CREATE"),
  createUser
);

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all admin users
 * @access  Private (USER_VIEW permission)
 */
router.get(
  "/users",
  authenticateUser,
  checkPermission("USER_VIEW"),
  getAllUsers
);

/**
 * @route   PUT /api/v1/admin/users/:userId
 * @desc    Update user details
 * @access  Private (USER_UPDATE permission)
 */
router.put(
  "/users/:userId",
  authenticateUser,
  checkPermission("USER_UPDATE"),
  updateUser
);

/**
 * @route   DELETE /api/v1/admin/users/:userId
 * @desc    Soft delete user
 * @access  Private (USER_DELETE permission)
 */
router.delete(
  "/users/:userId",
  authenticateUser,
  checkPermission("USER_DELETE"),
  deleteUser
);

module.exports = router;
