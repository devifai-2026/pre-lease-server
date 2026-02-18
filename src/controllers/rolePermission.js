const { Role, Permission, RolePermission } = require("../models/index");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { logRequest } = require("../utils/logs");
const { sendEncodedResponse } = require("../utils/responseEncoder");

// ============================================
// GET ALL ROLES WITH PERMISSIONS
// ============================================
/**
 * @route GET /api/v1/roles/permissions
 * @desc Get all roles with their associated permissions
 * @access Protected (Admin only recommended)
 */
const getAllRolesWithPermissions = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    // ✅ Query from Role, not RolePermission
    const rolesWithPermissions = await Role.findAll({
      attributes: ["roleId", "roleName", "roleType", "description", "isActive"],
      include: [
        {
          model: Permission,
          as: "permissions", // ✅ This matches the belongsToMany alias
          attributes: ["permissionId", "code", "description", "category"],
          through: {
            attributes: ["grantedAt", "grantedBy"],
          },
        },
      ],
      order: [
        ["roleId", "ASC"],
        [{ model: Permission, as: "permissions" }, "category", "ASC"],
        [{ model: Permission, as: "permissions" }, "code", "ASC"],
      ],
    });

    // Transform the response for better readability
    const formattedResponse = rolesWithPermissions.map((role) => ({
      roleId: role.roleId,
      roleName: role.roleName,
      roleType: role.roleType,
      description: role.description,
      isActive: role.isActive,
      permissionsCount: role.permissions.length,
      permissions: role.permissions.map((permission) => ({
        permissionId: permission.permissionId,
        code: permission.code,
        description: permission.description,
        category: permission.category,
        grantedAt: permission.RolePermission?.grantedAt || null,
        grantedBy: permission.RolePermission?.grantedBy || null,
      })),
    }));

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: {
          success: true,
          message: "Roles with permissions fetched successfully",
          count: formattedResponse.length,
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Roles with permissions fetched successfully",
      {
        count: formattedResponse.length,
        roles: formattedResponse,
      }
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );
    return next(error);
  }
});

// ============================================
// GET SPECIFIC ROLE WITH PERMISSIONS
// ============================================
/**
 * @route GET /api/v1/roles/:roleId/permissions
 * @desc Get a specific role with its permissions
 * @access Protected (Admin only recommended)
 */
const getRolePermissions = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { roleId } = req.params;

  const requestBodyLog = {
    roleId,
  };

  try {
    const role = await Role.findByPk(roleId, {
      attributes: ["roleId", "roleName", "roleType", "description", "isActive"],
      include: [
        {
          model: Permission,
          as: "permissions",
          attributes: ["permissionId", "code", "description", "category"],
          through: {
            attributes: ["grantedAt", "grantedBy"],
          },
        },
      ],
      order: [
        [{ model: Permission, as: "permissions" }, "category", "ASC"],
        [{ model: Permission, as: "permissions" }, "code", "ASC"],
      ],
    });

    if (!role) {
      throw createAppError(`Role with ID ${roleId} not found`, 404);
    }

    const formattedResponse = {
      roleId: role.roleId,
      roleName: role.roleName,
      roleType: role.roleType,
      description: role.description,
      isActive: role.isActive,
      permissionsCount: role.permissions.length,
      permissions: role.permissions.map((permission) => ({
        permissionId: permission.permissionId,
        code: permission.code,
        description: permission.description,
        category: permission.category,
        grantedAt: permission.RolePermission?.grantedAt || null,
        grantedBy: permission.RolePermission?.grantedBy || null,
      })),
    };

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: {
          success: true,
          message: "Role permissions fetched successfully",
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Role permissions fetched successfully",
      formattedResponse
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        requestBodyLog,
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );
    return next(error);
  }
});

// ============================================
// GET ROLE PERMISSIONS GROUPED BY CATEGORY
// ============================================
/**
 * @route GET /api/v1/roles/permissions/by-category
 * @desc Get all roles with permissions grouped by category
 * @access Protected (Admin only recommended)
 */
const getRolePermissionsByCategory = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    const rolesWithPermissions = await Role.findAll({
      attributes: ["roleId", "roleName", "roleType", "isActive"],
      include: [
        {
          model: Permission,
          as: "permissions",
          attributes: ["permissionId", "code", "description", "category"],
          through: {
            attributes: [],
          },
        },
      ],
    });

    const formattedResponse = rolesWithPermissions.map((role) => {
      // Group permissions by category
      const permissionsByCategory = role.permissions.reduce(
        (acc, permission) => {
          const category = permission.category || "Uncategorized";
          if (!acc[category]) {
            acc[category] = [];
          }

          acc[category].push({
            permissionId: permission.permissionId,
            code: permission.code,
            description: permission.description,
          });
          return acc;
        },
        {}
      );

      return {
        roleId: role.roleId,
        roleName: role.roleName,
        roleType: role.roleType,
        isActive: role.isActive,
        totalPermissions: role.permissions.length,
        permissionsByCategory,
      };
    });

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: {
          success: true,
          message: "Role permissions by category fetched successfully",
          count: formattedResponse.length,
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Role permissions by category fetched successfully",
      {
        count: formattedResponse.length,
        roles: formattedResponse,
      }
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );
    return next(error);
  }
});

module.exports = {
  getAllRolesWithPermissions,
  getRolePermissions,
  getRolePermissionsByCategory,
};
