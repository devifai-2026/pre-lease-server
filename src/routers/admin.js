const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  getUserById,
  createSuperAdmin,
  reassignProperty,
  getAllSalesRelatedActiveUsers,
  verifyProperty,
  unverifyProperty,
  getAllSalesManagers,
  adminGetAllProperties,
  adminGetPropertyById,
  getAdminNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  VERIFICATION_ALLOWED_ROLES,
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
router.get("/users", authenticateUser, getAllUsers);

/**
 * @route   GET /api/v1/admin/users/:userId
 * @desc    Get single user by ID
 */
router.get("/users/:userId", authenticateUser, getUserById);

/**
 * @route   PUT /api/v1/admin/users/:userId
 * @desc    Update user details
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
 * @route   POST /api/v1/admin/create-super-admin
 * @desc    Create first Super Admin account (one-time only, no password)
 * @access  Public (requires secret key)
 */
router.post("/create-super-admin", superAdminRateLimiter, createSuperAdmin);

// ============================================
// PROPERTY ASSIGNMENT
// ============================================

router.put(
  "/properties/:propertyId/assign",
  authenticateUser,
  (req, res, next) => {
    const allowedRoles = [
      "Admin",
      "Super Admin",
      "Sales Manager",
      "Sales Executive - Property Manager",
    ];
    const matchedRole = req.user.roles.find((r) =>
      allowedRoles.includes(r.roleName)
    );
    if (matchedRole) {
      req.userRole = matchedRole.roleName;
      return next();
    }
    return checkPermission("PROPERTY_UPDATE")(req, res, next);
  },
  reassignProperty
);

// ============================================
// LOOKUP ROUTES
// ============================================

router.get(
  "/sales-related-active-users/:roleName",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  getAllSalesRelatedActiveUsers
);

router.get(
  "/users/sales-managers",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getAllSalesManagers
);

// ============================================
// PROPERTY VERIFICATION ROUTES
// ============================================

/**
 * Shared role middleware for verify / un-verify routes.
 * Allows: Admin, Super Admin, Sales Executive - Property Manager
 * Falls back to PROPERTY_UPDATE permission check.
 */
const verifyRoleMiddleware = (req, res, next) => {
  const matchedRole = req.user.roles.find((r) =>
    VERIFICATION_ALLOWED_ROLES.includes(r.roleName)
  );
  if (matchedRole) {
    req.userRole = matchedRole.roleName;
    return next();
  }
  return checkPermission("PROPERTY_UPDATE")(req, res, next);
};

/**
 * @route   POST /api/v1/admin/properties/:propertyId/verify
 * @desc    Verify a property (logs verifier + role; recalculates isVerified)
 * @access  Admin, Super Admin, Sales Executive - Property Manager (own assignments only)
 * @rules   One person can verify only once;
 *          'partial' after 1st verifier;
 *          'completed' when both role groups (sales + admin) have verified.
 */
router.post(
  "/properties/:propertyId/verify",
  authenticateUser,
  verifyRoleMiddleware,
  verifyProperty
);

/**
 * @route   DELETE /api/v1/admin/properties/:propertyId/verify
 * @desc    Remove the calling user's own verification from a property
 * @access  Admin, Super Admin, Sales Executive - Property Manager
 * @rules   Only removes the caller's own log entry; isVerified is recalculated from remaining logs.
 */
router.delete(
  "/properties/:propertyId/verify",
  authenticateUser,
  verifyRoleMiddleware,
  unverifyProperty
);

// ============================================
// ADMIN PROPERTY FETCH ROUTES (include verificationLogs)
// ============================================

/**
 * @route   GET /api/v1/admin/properties
 * @desc    Get all properties with verificationLogs (admin only)
 * @access  Admin, Super Admin
 */
router.get(
  "/properties",
  authenticateUser,
  // checkAdminOrSuperAdmin,
  adminGetAllProperties
);

/**
 * @route   GET /api/v1/admin/properties/:propertyId
 * @desc    Get single property with full verificationLogs (admin only)
 * @access  Admin, Super Admin
 */
router.get(
  "/properties/:propertyId",
  authenticateUser,
  checkAdminOrSuperAdmin,
  adminGetPropertyById
);

/**
 * @route   GET /api/v1/admin/notifications
 * @desc    Get all notifications for the current admin/user
 * @access  Authenticated
 */
router.get("/notifications", authenticateUser, getAdminNotifications);

/**
 * @route   PATCH /api/v1/admin/notifications/read-all
 * @desc    Mark all notifications for the user as read
 * @access  Authenticated
 */
router.patch(
  "/notifications/read-all",
  authenticateUser,
  markAllNotificationsAsRead
);

/**
 * @route   PATCH /api/v1/admin/notifications/:notificationId/read
 * @desc    Mark a single notification as read
 * @access  Authenticated
 */
router.patch(
  "/notifications/:notificationId/read",
  authenticateUser,
  markNotificationAsRead
);

/**
 * @route   DELETE /api/v1/admin/notifications/clear-all
 * @desc    Permanently delete all notifications for the user
 * @access  Authenticated
 */
router.delete(
  "/notifications/clear-all",
  authenticateUser,
  deleteAllNotifications
);

/**
 * @route   DELETE /api/v1/admin/notifications/:notificationId
 * @desc    Soft delete a single notification for the user
 * @access  Authenticated
 */
router.delete(
  "/notifications/:notificationId",
  authenticateUser,
  deleteNotification
);

module.exports = router;
