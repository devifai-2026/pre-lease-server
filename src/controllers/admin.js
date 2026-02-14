const { Op } = require("sequelize");
const { User, Role, UserRole } = require("../models");
const {
  validateRequiredFields,
  isValidEmail,
  isValidPhone,
} = require("../utils/validators");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const {
  logRequest,
  logInsert,
  logUpdate,
  buildUpdateValues,
} = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { sendEncodedResponse } = require("../utils/responseEncoder");

// ============================================
// CREATE USER (Super Admin Only)
// ============================================
/**
 * @desc    Create new admin user (Sales Executive, Sales Manager, Admin, Super Admin)
 * @route   POST /api/v1/admin/users
 * @access  Private (Super Admin only with USER_CREATE permission)
 */
const createUser = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const {
    firstName,
    lastName,
    email,
    mobileNumber,
    roleName, // Sales Executive, Sales Manager, Admin, Super Admin
  } = req.body;

  const requestBodyLog = {
    email,
    mobileNumber,
    firstName,
    lastName,
    roleName,
    createdBy: req.userRole,
  };

  return (async () => {
    try {
      // ============================================
      // VALIDATION: Required Fields
      // ============================================
      const requiredFields = [
        "firstName",
        "lastName",
        "email",
        "mobileNumber",
        "roleName",
      ];
      const missing = validateRequiredFields(requiredFields, req.body);
      if (missing.length > 0) {
        throw createAppError(
          `Missing required fields: ${missing.join(", ")}`,
          400
        );
      }

      // ============================================
      // VALIDATION: Email & Phone Format
      // ============================================
      if (!isValidEmail(email)) {
        throw createAppError("Invalid email format", 400);
      }

      if (!isValidPhone(mobileNumber)) {
        throw createAppError(
          "Invalid mobile number. Must be 10 digits starting with 6-9",
          400
        );
      }

      // ============================================
      // VALIDATION: Check Target Role
      // ============================================
      const targetRole = await Role.findOne({
        where: { roleName, roleType: "admin", isActive: true },
      });

      if (!targetRole) {
        throw createAppError(`Invalid role: ${roleName}`, 400);
      }

      // Block client roles explicitly
      if (targetRole.roleType === "client") {
        throw createAppError(
          "Cannot create client roles (Owner, Investor, Broker). These are created via signup API.",
          403
        );
      }

      // ============================================
      // VALIDATION: Check if user already exists
      // ============================================
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ email }, { mobileNumber }],
        },
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw createAppError("Email already exists", 409);
        }
        if (existingUser.mobileNumber === mobileNumber) {
          throw createAppError("Mobile number already exists", 409);
        }
      }

      // ============================================
      // START TRANSACTION: Create User + Assign Role
      // ============================================
      const result = await sequelize.transaction(async (t) => {
        // Create user
        const newUser = await User.create(
          {
            firstName,
            lastName,
            email,
            mobileNumber,
            userType: "admin", // Always admin type
            isActive: true,
          },
          { transaction: t }
        );

        // Assign role
        await UserRole.create(
          {
            userId: newUser.userId,
            roleId: targetRole.roleId,
            assignedBy: req.user.userId,
          },
          { transaction: t }
        );

        // ✅ CREATE AUDIT LOG
        await logInsert({
          userId: req.user.userId,
          entityType: "User",
          recordId: newUser.userId,
          newRecord: {
            userId: newUser.userId,
            email: newUser.email,
            mobileNumber: newUser.mobileNumber,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            userType: newUser.userType,
            roleName: targetRole.roleName,
            createdBy: req.userRole,
          },
          tableName: "users",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });

        return {
          user: newUser,
          role: targetRole,
        };
      });

      // ============================================
      // PREPARE RESPONSE
      // ============================================
      const data = {
        userId: result.user.userId,
        name: `${result.user.firstName} ${result.user.lastName}`,
        email: result.user.email,
        mobileNumber: result.user.mobileNumber,
        role: result.role.roleName,
        userType: result.user.userType,
      };

      // ============================================
      // LOG SUCCESS
      // ============================================
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 201,
          body: { success: true, message: "User created successfully" },
          requestBodyLog: {
            ...requestBodyLog,
            createdUserId: result.user.userId,
          },
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        201,
        true,
        "User created successfully",
        data
      );
    } catch (error) {
      // ============================================
      // LOG FAILURE
      // ============================================
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
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// UPDATE USER (Super Admin/Admin)
// ============================================
/**
 * @desc    Update user details (name, email, phone, role)
 * @route   PUT /api/v1/admin/users/:userId
 * @access  Private (Super Admin/Admin with USER_UPDATE permission)
 */
const updateUser = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();
  const { userId } = req.params;

  const { firstName, lastName, email, mobileNumber, roleName, isActive } =
    req.body;

  const requestBodyLog = {
    userId,
    updatedFields: Object.keys(req.body),
    updatedBy: req.userRole,
  };

  return (async () => {
    try {
      // ============================================
      // VALIDATION: Check if user exists
      // ============================================
      const existingUser = await User.findOne({
        where: { userId },
        include: [
          {
            model: Role,
            as: "roles",
            through: { attributes: [] },
            attributes: ["roleId", "roleName", "roleType"],
          },
        ],
      });

      if (!existingUser) {
        throw createAppError("User not found", 404);
      }

      // ============================================
      // ✅ RESTRICTION: Cannot update client users (Owner, Broker, Investor)
      // ============================================
      const currentRole = existingUser.roles[0];
      if (currentRole.roleType === "client") {
        throw createAppError(
          "Cannot update client users (Owner, Broker, Investor) via admin API",
          403
        );
      }

      // ============================================
      // VALIDATION: Email & Phone uniqueness
      // ============================================
      if (email || mobileNumber) {
        const duplicateUser = await User.findOne({
          where: {
            userId: { [Op.ne]: userId },
            [Op.or]: [
              ...(email ? [{ email }] : []),
              ...(mobileNumber ? [{ mobileNumber }] : []),
            ],
          },
        });

        if (duplicateUser) {
          if (duplicateUser.email === email) {
            throw createAppError("Email already exists", 409);
          }
          if (duplicateUser.mobileNumber === mobileNumber) {
            throw createAppError("Mobile number already exists", 409);
          }
        }
      }

      // ============================================
      // VALIDATION: New role check
      // ============================================
      let newRole = null;
      if (roleName && roleName !== currentRole.roleName) {
        newRole = await Role.findOne({
          where: { roleName, roleType: "admin", isActive: true },
        });

        if (!newRole) {
          throw createAppError(`Invalid role: ${roleName}`, 400);
        }
      }

      // ✅ Store old values for audit log
      const oldRecord = existingUser.toJSON();

      // ============================================
      // START TRANSACTION: Update User
      // ============================================
      const result = await sequelize.transaction(async (t) => {
        // Prepare update data
        const updateData = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (email) updateData.email = email;
        if (mobileNumber) updateData.mobileNumber = mobileNumber;
        if (isActive !== undefined) updateData.isActive = isActive;

        // Update user
        if (Object.keys(updateData).length > 0) {
          await existingUser.update(updateData, { transaction: t });
        }

        // Update role if changed
        if (newRole) {
          await UserRole.update(
            { roleId: newRole.roleId },
            {
              where: { userId },
              transaction: t,
            }
          );
        }

        // ✅ BUILD AUDIT LOG
        const { oldValues, newValues } = buildUpdateValues(
          oldRecord,
          updateData
        );
        if (newRole) {
          oldValues.roleName = currentRole.roleName;
          newValues.roleName = newRole.roleName;
        }
        newValues.updatedBy = req.userRole;

        // ✅ CREATE AUDIT LOG
        await logUpdate({
          userId: req.user.userId,
          entityType: "User",
          recordId: userId,
          oldValues,
          newValues,
          tableName: "users",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });

        return {
          user: existingUser,
          newRole: newRole || currentRole,
        };
      });

      // ============================================
      // PREPARE RESPONSE
      // ============================================
      const data = {
        userId: result.user.userId,
        name: `${result.user.firstName} ${result.user.lastName}`,
        email: result.user.email,
        mobileNumber: result.user.mobileNumber,
        role: result.newRole.roleName,
        isActive: result.user.isActive,
      };

      // ============================================
      // LOG SUCCESS
      // ============================================
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 200,
          body: { success: true, message: "User updated successfully" },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        200,
        true,
        "User updated successfully",
        data
      );
    } catch (error) {
      // ============================================
      // LOG FAILURE
      // ============================================
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
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// DELETE USER (Super Admin/Admin)
// ============================================
/**
 * @desc    Soft delete user (set isActive = false)
 * @route   DELETE /api/v1/admin/users/:userId
 * @access  Private (Super Admin/Admin with USER_DELETE permission)
 */
const deleteUser = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();
  const { userId } = req.params;

  const requestBodyLog = {
    userId,
    deletedBy: req.userRole,
  };

  return (async () => {
    try {
      // ============================================
      // VALIDATION: Check if user exists
      // ============================================
      const existingUser = await User.findOne({
        where: { userId, isActive: true },
        include: [
          {
            model: Role,
            as: "roles",
            through: { attributes: [] },
            attributes: ["roleId", "roleName", "roleType"],
          },
        ],
      });

      if (!existingUser) {
        throw createAppError("User not found or already deleted", 404);
      }

      // ============================================
      // ✅ RESTRICTION: Cannot delete client users
      // ============================================
      const currentRole = existingUser.roles[0];
      if (currentRole.roleType === "client") {
        throw createAppError(
          "Cannot delete client users (Owner, Broker, Investor) via admin API",
          403
        );
      }

      // ============================================
      // ✅ RESTRICTION: Cannot delete yourself
      // ============================================
      if (userId === req.user.userId) {
        throw createAppError("Cannot delete your own account", 403);
      }

      // ✅ Store old values for audit log
      const oldRecord = existingUser.toJSON();

      // ============================================
      // START TRANSACTION: Soft Delete
      // ============================================
      await sequelize.transaction(async (t) => {
        // Soft delete user
        await existingUser.update({ isActive: false }, { transaction: t });

        // ✅ CREATE AUDIT LOG
        await logUpdate({
          userId: req.user.userId,
          entityType: "User",
          recordId: userId,
          oldValues: { isActive: true },
          newValues: { isActive: false, deletedBy: req.userRole },
          tableName: "users",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });
      });

      // ============================================
      // PREPARE RESPONSE
      // ============================================
      const data = {
        userId: existingUser.userId,
        name: `${existingUser.firstName} ${existingUser.lastName}`,
        email: existingUser.email,
        deletedAt: new Date(),
      };

      // ============================================
      // LOG SUCCESS
      // ============================================
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 200,
          body: { success: true, message: "User deleted successfully" },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        200,
        true,
        "User deleted successfully",
        data
      );
    } catch (error) {
      // ============================================
      // LOG FAILURE
      // ============================================
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
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// GET ALL USERS (Super Admin/Admin)
// ============================================
/**
 * @desc    Get all admin users with pagination
 * @route   GET /api/v1/admin/users
 * @access  Private (Super Admin/Admin with USER_VIEW permission)
 */
const getAllUsers = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const { page = 1, limit = 10, roleName, isActive } = req.query;

  const requestBodyLog = {
    page,
    limit,
    filters: { roleName, isActive },
  };

  return (async () => {
    try {
      // ============================================
      // BUILD WHERE CLAUSE
      // ============================================
      const whereClause = {
        userType: "admin", // ✅ Only admin users
      };

      if (isActive !== undefined) {
        whereClause.isActive = isActive === "true";
      }

      // ============================================
      // BUILD ROLE FILTER
      // ============================================
      const roleWhere = {};
      if (roleName) {
        roleWhere.roleName = roleName;
      }

      // ============================================
      // PAGINATION SETUP
      // ============================================
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
      const offset = (pageNumber - 1) * pageSize;

      // ============================================
      // FETCH USERS
      // ============================================
      const { count, rows: users } = await User.findAndCountAll({
        where: whereClause,
        attributes: [
          "userId",
          "firstName",
          "lastName",
          "email",
          "mobileNumber",
          "isActive",
          "createdAt",
        ],
        include: [
          {
            model: Role,
            as: "roles",
            through: { attributes: [] },
            attributes: ["roleId", "roleName", "roleType"],
            where: roleWhere,
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: pageSize,
        offset: offset,
        distinct: true,
      });

      // ============================================
      // PAGINATION METADATA
      // ============================================
      const totalPages = Math.ceil(count / pageSize);
      const hasNextPage = pageNumber < totalPages;
      const hasPrevPage = pageNumber > 1;

      const pagination = {
        currentPage: pageNumber,
        totalPages,
        totalUsers: count,
        hasNextPage,
        hasPrevPage,
        usersPerPage: pageSize,
      };

      // ============================================
      // FORMAT RESPONSE
      // ============================================
      const formattedUsers = users.map((user) => ({
        userId: user.userId,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.roles[0]?.roleName || null,
        isActive: user.isActive,
        createdAt: user.createdAt,
      }));

      // ============================================
      // LOG SUCCESS
      // ============================================
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 200,
          body: { success: true, message: "Users fetched successfully", count },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        200,
        true,
        "Users fetched successfully",
        formattedUsers,
        pagination
      );
    } catch (error) {
      // ============================================
      // LOG FAILURE
      // ============================================
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
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// CREATE FIRST SUPER ADMIN (One-Time Only, No Password)
// ============================================
/**
 * @desc    Create first Super Admin account (no authentication/password required)
 * @route   POST /api/v1/auth/create-super-admin
 * @access  Public (only works if no Super Admin exists)
 */
const createSuperAdmin = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const {
    firstName,
    lastName,
    email,
    mobileNumber,
    secretKey, // Extra security: require a secret key from .env
  } = req.body;

  const requestBodyLog = {
    email,
    mobileNumber,
    firstName,
    lastName,
    hasSecretKey: !!secretKey,
  };

  return (async () => {
    try {
      // ============================================
      // ✅ SECURITY CHECK 1: Secret Key Validation
      // ============================================
      const SUPER_ADMIN_SECRET = process.env.SUPER_ADMIN_CREATION_SECRET;

      if (!SUPER_ADMIN_SECRET) {
        throw createAppError(
          "Super Admin creation is disabled. Set SUPER_ADMIN_CREATION_SECRET in .env",
          403
        );
      }

      if (secretKey !== SUPER_ADMIN_SECRET) {
        throw createAppError("Invalid secret key", 403);
      }

      // ============================================
      // ✅ SECURITY CHECK 2: Check if Super Admin already exists
      // ============================================
      const superAdminRole = await Role.findOne({
        where: { roleName: "Super Admin", isActive: true },
      });

      if (!superAdminRole) {
        throw createAppError("Super Admin role not found in database", 500);
      }

      const existingSuperAdmin = await User.findOne({
        include: [
          {
            model: Role,
            as: "roles",
            where: { roleName: "Super Admin" },
            through: { attributes: [] },
          },
        ],
      });

      if (existingSuperAdmin) {
        throw createAppError(
          "Super Admin already exists. Cannot create another one.",
          409
        );
      }

      // ============================================
      // VALIDATION: Required Fields
      // ============================================
      const requiredFields = ["firstName", "lastName", "email", "mobileNumber"];
      const missing = validateRequiredFields(requiredFields, req.body);
      if (missing.length > 0) {
        throw createAppError(
          `Missing required fields: ${missing.join(", ")}`,
          400
        );
      }

      // ============================================
      // VALIDATION: Email & Phone Format
      // ============================================
      if (!isValidEmail(email)) {
        throw createAppError("Invalid email format", 400);
      }

      if (!isValidPhone(mobileNumber)) {
        throw createAppError(
          "Invalid mobile number. Must be 10 digits starting with 6-9",
          400
        );
      }

      // ============================================
      // VALIDATION: Check if email/phone already exists
      // ============================================
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ email }, { mobileNumber }],
        },
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw createAppError("Email already exists", 409);
        }
        if (existingUser.mobileNumber === mobileNumber) {
          throw createAppError("Mobile number already exists", 409);
        }
      }

      // ============================================
      // START TRANSACTION: Create Super Admin
      // ============================================
      const result = await sequelize.transaction(async (t) => {
        // Create user (no password field)
        const newSuperAdmin = await User.create(
          {
            firstName,
            lastName,
            email,
            mobileNumber,
            userType: "admin",
            isActive: true,
          },
          { transaction: t }
        );

        // Assign Super Admin role
        await UserRole.create(
          {
            userId: newSuperAdmin.userId,
            roleId: superAdminRole.roleId,
            assignedBy: null, // System-assigned
          },
          { transaction: t }
        );

        // ✅ CREATE AUDIT LOG
        await logInsert({
          userId: newSuperAdmin.userId,
          entityType: "User",
          recordId: newSuperAdmin.userId,
          newRecord: {
            userId: newSuperAdmin.userId,
            email: newSuperAdmin.email,
            mobileNumber: newSuperAdmin.mobileNumber,
            firstName: newSuperAdmin.firstName,
            lastName: newSuperAdmin.lastName,
            userType: newSuperAdmin.userType,
            roleName: "Super Admin",
            createdBy: "SYSTEM",
            note: "First Super Admin account created (passwordless)",
          },
          tableName: "users",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });

        return {
          user: newSuperAdmin,
          role: superAdminRole,
        };
      });

      // ============================================
      // PREPARE RESPONSE
      // ============================================
      const data = {
        userId: result.user.userId,
        name: `${result.user.firstName} ${result.user.lastName}`,
        email: result.user.email,
        mobileNumber: result.user.mobileNumber,
        role: result.role.roleName,
      };

      // ============================================
      // LOG SUCCESS
      // ============================================
      await logRequest(
        req,
        {
          userId: result.user.userId,
          status: 201,
          body: {
            success: true,
            message: "Super Admin account created successfully",
          },
          requestBodyLog: {
            ...requestBodyLog,
            createdUserId: result.user.userId,
          },
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        201,
        true,
        "Super Admin account created successfully",
        data
      );
    } catch (error) {
      // ============================================
      // LOG FAILURE
      // ============================================
      await logRequest(
        req,
        {
          userId: null,
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

module.exports = {
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  createSuperAdmin,
};
