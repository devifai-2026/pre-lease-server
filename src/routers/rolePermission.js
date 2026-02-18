const express = require("express");
const router = express.Router();
const {
  getAllRolesWithPermissions,
  getRolePermissions,
  getRolePermissionsByCategory,
} = require("../controllers/rolePermission");
const { authenticateUser, checkRole } = require("../middlewares/auth");

// Get all roles with their permissions
router.get(
  "/roles/permissions",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getAllRolesWithPermissions
);

// Get permissions grouped by category for all roles
router.get(
  "/roles/permissions/by-category",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getRolePermissionsByCategory
);

// Get a specific role's permissions
router.get(
  "/roles/:roleId/permissions",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getRolePermissions
);

module.exports = router;
