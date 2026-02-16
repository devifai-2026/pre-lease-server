const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  createSuperAdmin,
  reassignProperty,
  getAllActiveSalesManagers,
} = require("../controllers/admin");
const {
  authenticateUser,
  checkPermission,
  checkAdminOrSuperAdmin,
} = require("../middlewares/auth");

const superAdminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again after 15 minutes",
  },
});

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

/**
 * @route   POST /api/v1/auth/create-super-admin
 * @desc    Create first Super Admin account (one-time only, no password)
 * @access  Public (requires secret key)
 */
router.post("/create-super-admin", superAdminRateLimiter, createSuperAdmin);

router.put(
  "/properties/:propertyId/assign",
  authenticateUser,
  (req, res, next) => {
    const isSalesPerson = req.user.roles.some((r) =>
      ["Sales Manager", "Sales Executive"].includes(r.roleName)
    );
    if (isSalesPerson) {
      return next();
    }
    return checkPermission("PROPERTY_UPDATE")(req, res, next);
  },
  reassignProperty
);

// ✅ NEW: Get Sales Managers
router.get(
  "/sales-managers",
  authenticateUser,
  checkAdminOrSuperAdmin,
  getAllActiveSalesManagers
);

module.exports = router;
