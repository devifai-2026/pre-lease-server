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
  getAllSalesRelatedActiveUsers,
  verifyProperty,
  getAllSalesManagers,
} = require("../controllers/admin");
const {
  authenticateUser,
  checkPermission,
  checkAdminOrSuperAdmin,
  checkRole,
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

// Create User - Admin, Super Admin, Sales Manager
// (Logic inside controller handles specific role restrictions)
router.post(
  "/users",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  createUser
);

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users (Accessible by all authenticated users)
 */
router.get(
  "/users",
  authenticateUser,
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
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  updateUser
);

/**
 * @route   DELETE /api/v1/admin/users/:userId
 * @desc    Soft delete user (Admin/Super Admin)
 */
router.delete(
  "/users/:userId",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
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
      [
        "Sales Manager",
        "Sales Executive - Property Manager",
        "Sales Executive - Client Dealer",
      ].includes(r.roleName)
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
  "/sales-related-active-users/:roleName",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  getAllSalesRelatedActiveUsers
);

// ✅ NEW: Verify Property
// Allowed for: Assigned Sales Executive - Property Manager, Admin, Super Admin
// The controller handles specific assignment checks. Middleware allows broad roles.
router.post(
  "/properties/:propertyId/verify",
  authenticateUser,
  (req, res, next) => {
    const allowedRoles = ["Admin", "Super Admin", "Sales Executive - Property Manager"];
    const hasRole = req.user.roles.some((r) => allowedRoles.includes(r.roleName));
    if (hasRole) return next();
    return checkPermission("PROPERTY_UPDATE")(req, res, next); // Fallback
  },
  verifyProperty
);

// ✅ NEW: Get All Sales Managers
// Allowed for: Admin, Super Admin
router.get(
  "/users/sales-managers",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getAllSalesManagers
);

module.exports = router;
