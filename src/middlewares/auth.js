// middleware/auth.js
const { User, Role, Permission } = require("../models");
const { Op } = require("sequelize");
const Token = require("../models/token");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * ✅ Middleware to authenticate user via JWT token
 * ONLY authenticates - does NOT fetch permissions
 * Lightweight and fast - just verifies token and fetches user with roles
 */
const authenticateUser = asyncHandler(async (req, res, next) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw createAppError("No access token provided", 401);
  }

  const accessToken = authHeader.split(" ")[1];

  // Verify access token using Token model method
  const { valid, decoded, message, expired } =
    Token.verifyAccessToken(accessToken);

  if (!valid) {
    const error = createAppError(message, 401);
    error.expired = expired; // Attach expired flag for refresh token logic
    throw error;
  }

  // ✅ Fetch user with roles ONLY (no permissions - much faster)
  const user = await User.findOne({
    where: { userId: decoded._id, isActive: true },
    attributes: [
      "userId",
      "email",
      "mobileNumber",
      "firstName",
      "lastName",
      "userType",
      "joinType",
      "isGuest",
    ],
    include: [
      {
        model: Role,
        as: "roles",
        through: { attributes: [] }, // Don't include junction table fields
        attributes: ["roleId", "roleName", "roleType"],
        where: { isActive: true }, // ✅ Only active roles
        required: false, // ✅ Guest users have no roles yet — still allowed through
      },
    ],
  });

  // Verify user exists
  if (!user) {
    throw createAppError("User not found or inactive", 401);
  }

  const roles = user.roles || [];

  // ✅ Attach minimal user info to request (no permissions)
  req.user = {
    userId: user.userId,
    email: user.email,
    mobileNumber: user.mobileNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    userType: user.userType,
    joinType: user.joinType,
    isGuest: user.isGuest,
    role: roles[0]?.roleName || "guest", // Primary role for backward compat
    roles, // Full roles array (empty for guests)
  };

  next();
});

/**
 * ✅ Middleware to check if user has specific permission
 * Fetches ONLY the required permission from database (single targeted query)
 * @param {string} permissionCode - Permission code (e.g., 'PROPERTY_CREATE')
 */
const checkPermission = (permissionCode) => {
  return asyncHandler(async (req, res, next) => {
    // Verify user is authenticated
    if (!req.user || !req.user.roles) {
      throw createAppError("User not authenticated", 401);
    }

    // Extract role IDs from authenticated user
    const roleIds = req.user.roles.map((role) => role.roleId);

    // ✅ Fetch ONLY the specific permission for user's active roles
    // Uses findOne for performance (stops at first match)
    const permission = await Permission.findOne({
      attributes: ["permissionId", "code", "description", "category"],
      where: {
        code: permissionCode, // ✅ Match exact permission code
      },
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] }, // Don't include junction table
          attributes: ["roleId", "roleName"],
          where: {
            roleId: roleIds, // ✅ User's role IDs
            isActive: true, // ✅ Only check isActive on roles (NOT permissions)
          },
          required: true, // Permission must be assigned to at least one of user's roles
        },
      ],
    });

    // Check if permission exists for user's roles
    if (!permission) {
      throw createAppError(
        `Access denied. Required permission: ${permissionCode}`,
        403
      );
    }

    // ✅ Attach permission info to request for logging/audit
    req.userPermission = permissionCode;
    req.userRole = req.user.roles[0].roleName; // Primary role

    next();
  });
};

/**
 * ✅ OPTIMIZED: Middleware to check if user has ANY of the specified permissions
 * Uses findOne with OR condition - stops at FIRST match (faster than findAll)
 * @param {Array<string>} permissionCodes - Array of permission codes
 */
const checkAnyPermission = (permissionCodes) => {
  return asyncHandler(async (req, res, next) => {
    // Verify user is authenticated
    if (!req.user || !req.user.roles) {
      throw createAppError("User not authenticated", 401);
    }

    // Extract role IDs from authenticated user
    const roleIds = req.user.roles.map((role) => role.roleId);

    // ✅ Use findOne with OR condition (faster - stops at first match)
    const permission = await Permission.findOne({
      attributes: ["permissionId", "code", "description", "category"],
      where: {
        code: {
          [Op.in]: permissionCodes, // ✅ Match ANY of these permission codes
        },
      },
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName"],
          where: {
            roleId: roleIds, // ✅ User's role IDs
            isActive: true, // ✅ Only active roles
          },
          required: true, // Must match at least one role
        },
      ],
    });
    // Check if user has at least ONE of the required permissions
    if (!permission) {
      throw createAppError(
        `Access denied. Required permissions: ${permissionCodes.join(" or ")}`,
        403
      );
    }

    // ✅ Attach found permission to request
    req.userPermission = permission.code; // The permission that matched
    req.userRole = req.user.roles[0].roleName;

    next();
  });
};

/**
 * ✅ Middleware to check if user has ALL of the specified permissions
 * Fetches ONLY the specified permissions (not all permissions)
 * Verifies count matches requested count
 * @param {Array<string>} permissionCodes - Array of permission codes
 */
const checkAllPermissions = (permissionCodes) => {
  return asyncHandler(async (req, res, next) => {
    // Verify user is authenticated
    if (!req.user || !req.user.roles) {
      throw createAppError("User not authenticated", 401);
    }

    // Extract role IDs from authenticated user
    const roleIds = req.user.roles.map((role) => role.roleId);

    // ✅ Fetch ONLY the specified permissions for user's active roles
    const permissions = await Permission.findAll({
      attributes: ["permissionId", "code", "description", "category"],
      where: {
        code: {
          [Op.in]: permissionCodes, // ✅ Match these permission codes
        },
      },
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName"],
          where: {
            roleId: roleIds, // ✅ User's role IDs
            isActive: true, // ✅ Only active roles
          },
          required: true,
        },
      ],
    });

    // Extract found permission codes
    const foundCodes = permissions.map((p) => p.code);

    // ✅ Verify user has ALL required permissions (not just some)
    const hasAllPermissions = permissionCodes.every((code) =>
      foundCodes.includes(code)
    );

    if (!hasAllPermissions) {
      // Calculate which permissions are missing for better error message
      const missingPermissions = permissionCodes.filter(
        (code) => !foundCodes.includes(code)
      );
      throw createAppError(
        `Access denied. Missing permissions: ${missingPermissions.join(", ")}`,
        403
      );
    }

    // ✅ Attach all permissions to request
    req.userPermissions = foundCodes;
    req.userRole = req.user.roles[0].roleName;

    next();
  });
};

/**
 * Middleware to check if user has one of the allowed roles
 * Does NOT query database - uses roles already in req.user
 * @param {Array<string>} allowedRoles - Array of role names (e.g., ['Owner', 'Broker'])
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // Verify user is authenticated
    if (!req.user || !req.user.roles) {
      return next(createAppError("User not authenticated", 401));
    }

    // Extract role names from user's roles
    const userRoleNames = req.user.roles.map((role) => role.roleName);

    // Check if user has any of the allowed roles — find the first match
    const matchedRole = req.user.roles.find((role) =>
      allowedRoles.includes(role.roleName)
    );

    if (!matchedRole) {
      const message = req.user.isGuest
        ? "Complete your first action to activate your account"
        : `Access denied. Required roles: ${allowedRoles.join(" or ")}`;
      return next(createAppError(message, 403));
    }

    // Attach the MATCHED role (not blindly roles[0]) so controllers see the right role
    req.userRole = matchedRole.roleName;

    next();
  };
};

/**
 * Middleware to check if user's role is NOT in the excluded list
 * @param {Array<string>} excludedRoles - Array of role names to exclude
 */
const checkExcludeRole = (excludedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return next(createAppError("User not authenticated", 401));
    }
    const userRoleNames = req.user.roles.map((role) => role.roleName);
    const isExcluded = userRoleNames.some((role) =>
      excludedRoles.includes(role)
    );
    if (isExcluded) {
      return next(
        createAppError(
          `Access denied for your role.`,
          403
        )
      );
    }
    req.userRole = req.user.roles[0].roleName;
    next();
  };
};

// ============================================
// PREDEFINED ROLE CHECKS (for convenience)
// ============================================
const checkOwner = checkRole(["Owner"]);
const checkBroker = checkRole(["Broker"]);
const checkOwnerOrBroker = checkRole(["Owner", "Broker"]);
const checkInvestor = checkRole(["Investor"]);
const checkAdminOrSuperAdmin = checkRole(["Admin", "Super Admin"]);
const checkSalesPerson = checkRole([
  "Sales Manager",
  "Sales Executive",
  "Sales Executive - Property Manager",
  "Sales Executive - Client Dealer",
]);
const checkOperationalStaff = checkExcludeRole(["Owner", "Broker", "Investor"]);

module.exports = {
  authenticateUser,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkRole,
  checkOwner,
  checkBroker,
  checkOwnerOrBroker,
  checkInvestor,
  checkAdminOrSuperAdmin,
  checkSalesPerson,
  checkExcludeRole,
  checkOperationalStaff,
};
