const { Op } = require("sequelize");
const {
  User,
  Role,
  UserRole,
  Property,
  SalesRelationship,
} = require("../models");
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
const { getIO } = require("../config/socket");

const createUser = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { firstName, lastName, email, mobileNumber, roleName, salesManagerId } =
    req.body; // ✅ Added salesManagerId

  const requestBodyLog = {
    email,
    mobileNumber,
    firstName,
    lastName,
    roleName,
    salesManagerId,
    createdBy: req.userRole,
  };

  try {
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

    if (!isValidEmail(email)) {
      throw createAppError("Invalid email format", 400);
    }

    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    const targetRole = await Role.findOne({
      where: { roleName, roleType: "admin", isActive: true },
    });

    if (!targetRole) {
      throw createAppError(`Invalid role: ${roleName}`, 400);
    }

    if (targetRole.roleType === "client") {
      throw createAppError(
        "Cannot create client roles (Owner, Investor, Broker). These are created via signup API.",
        403
      );
    }

    // ✅ NEW: Sales Manager role-specific validations
    if (req.userRole === "Sales Manager") {
      // Sales Manager can ONLY create Sales Executive
      if (roleName !== "Sales Executive") {
        throw createAppError(
          "Sales Manager can only create Sales Executive users",
          403
        );
      }

      // Sales Executive will be automatically assigned to the Sales Manager creating them
      // No need for salesManagerId in request body for Sales Manager
    }

    // ✅ NEW: If creating Sales Executive, validate salesManagerId requirement
    if (roleName === "Sales Executive") {
      if (req.userRole === "Admin" || req.userRole === "Super Admin") {
        // Admin/Super Admin MUST provide salesManagerId
        if (!salesManagerId) {
          throw createAppError(
            "salesManagerId is required when creating Sales Executive",
            400
          );
        }

        // Verify the salesManagerId exists and has Sales Manager role
        const salesManager = await User.findOne({
          where: { userId: salesManagerId, isActive: true },
          include: [
            {
              model: Role,
              as: "roles",
              where: { roleName: "Sales Manager", isActive: true },
              through: { attributes: [] },
            },
          ],
          attributes: ["userId"],
        });

        if (!salesManager) {
          throw createAppError(
            "Invalid salesManagerId. User must be an active Sales Manager",
            400
          );
        }
      }
    }

    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { mobileNumber }] },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw createAppError("Email already exists", 409);
      }
      if (existingUser.mobileNumber === mobileNumber) {
        throw createAppError("Mobile number already exists", 409);
      }
    }

    const result = await sequelize.transaction(async (t) => {
      const newUser = await User.create(
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

      await UserRole.create(
        {
          userId: newUser.userId,
          roleId: targetRole.roleId,
          assignedBy: req.user.userId,
        },
        { transaction: t }
      );

      // ✅ NEW: Create SalesRelationship if creating Sales Executive
      let salesRelationship = null;
      if (roleName === "Sales Executive") {
        const managerUserId =
          req.userRole === "Sales Manager" ? req.user.userId : salesManagerId;

        salesRelationship = await SalesRelationship.create(
          {
            salesExecutiveId: newUser.userId,
            salesManagerId: managerUserId,
            assignedBy: req.user.userId,
            isActive: true,
          },
          { transaction: t }
        );
      }

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
          ...(salesRelationship && {
            salesManagerId: salesRelationship.salesManagerId,
          }), // ✅ Log manager assignment
        },
        tableName: "users",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        transaction: t,
      });

      return { user: newUser, role: targetRole, salesRelationship };
    });

    const data = {
      userId: result.user.userId,
      name: `${result.user.firstName} ${result.user.lastName}`,
      email: result.user.email,
      mobileNumber: result.user.mobileNumber,
      role: result.role.roleName,
      userType: result.user.userType,
      ...(result.salesRelationship && {
        salesManagerId: result.salesRelationship.salesManagerId,
      }), // ✅ Include manager ID in response
    };

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
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      201,
      true,
      "User created successfully",
      data
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

const updateUser = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { userId } = req.params;

  const { firstName, lastName, email, mobileNumber, roleName, isActive } =
    req.body;

  const requestBodyLog = {
    userId,
    updatedFields: Object.keys(req.body),
    updatedBy: req.userRole,
  };

  try {
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

    const currentRole = existingUser.roles[0];
    if (currentRole.roleType === "client") {
      throw createAppError(
        "Cannot update client users (Owner, Broker, Investor) via admin API",
        403
      );
    }

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

    let newRole = null;
    if (roleName && roleName !== currentRole.roleName) {
      newRole = await Role.findOne({
        where: { roleName, roleType: "admin", isActive: true },
      });

      if (!newRole) {
        throw createAppError(`Invalid role: ${roleName}`, 400);
      }
    }

    const oldRecord = existingUser.toJSON();

    const result = await sequelize.transaction(async (t) => {
      const updateData = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email;
      if (mobileNumber) updateData.mobileNumber = mobileNumber;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (Object.keys(updateData).length > 0) {
        await existingUser.update(updateData, { transaction: t });
      }

      if (newRole) {
        await UserRole.update(
          { roleId: newRole.roleId },
          { where: { userId }, transaction: t }
        );
      }

      const { oldValues, newValues } = buildUpdateValues(oldRecord, updateData);
      if (newRole) {
        oldValues.roleName = currentRole.roleName;
        newValues.roleName = newRole.roleName;
      }
      newValues.updatedBy = req.userRole;

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

      return { user: existingUser, newRole: newRole || currentRole };
    });

    const data = {
      userId: result.user.userId,
      name: `${result.user.firstName} ${result.user.lastName}`,
      email: result.user.email,
      mobileNumber: result.user.mobileNumber,
      role: result.newRole.roleName,
      isActive: result.user.isActive,
    };

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "User updated successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "User updated successfully",
      data
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

const deleteUser = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { userId } = req.params;

  const requestBodyLog = {
    userId,
    deletedBy: req.userRole,
  };

  try {
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

    const currentRole = existingUser.roles[0];
    if (currentRole.roleType === "client") {
      throw createAppError(
        "Cannot delete client users (Owner, Broker, Investor) via admin API",
        403
      );
    }

    if (userId === req.user.userId) {
      throw createAppError("Cannot delete your own account", 403);
    }

    await sequelize.transaction(async (t) => {
      await existingUser.update({ isActive: false }, { transaction: t });

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

    const data = {
      userId: existingUser.userId,
      name: `${existingUser.firstName} ${existingUser.lastName}`,
      email: existingUser.email,
      deletedAt: new Date(),
    };

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "User deleted successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "User deleted successfully",
      data
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

const getAllUsers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { page = 1, limit = 10, roleName, isActive } = req.query;

  const requestBodyLog = {
    page,
    limit,
    filters: { roleName, isActive },
  };

  try {
    const whereClause = { userType: "admin" };

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true";
    }

    const roleWhere = {};
    if (roleName) {
      roleWhere.roleName = roleName;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

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

    const formattedUsers = users.map((user) => ({
      userId: user.userId,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobileNumber: user.mobileNumber,
      role: user.roles[0]?.roleName || null,
      isActive: user.isActive,
      createdAt: user.createdAt,
    }));

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "Users fetched successfully", count },
        requestBodyLog,
      },
      requestStartTime
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

const createSuperAdmin = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { firstName, lastName, email, mobileNumber, secretKey } = req.body;

  const requestBodyLog = {
    email,
    mobileNumber,
    firstName,
    lastName,
    hasSecretKey: !!secretKey,
  };

  try {
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

    const requiredFields = ["firstName", "lastName", "email", "mobileNumber"];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

    if (!isValidEmail(email)) {
      throw createAppError("Invalid email format", 400);
    }

    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { mobileNumber }] },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw createAppError("Email already exists", 409);
      }
      if (existingUser.mobileNumber === mobileNumber) {
        throw createAppError("Mobile number already exists", 409);
      }
    }

    const result = await sequelize.transaction(async (t) => {
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

      await UserRole.create(
        {
          userId: newSuperAdmin.userId,
          roleId: superAdminRole.roleId,
          assignedBy: null,
        },
        { transaction: t }
      );

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
        },
        tableName: "users",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        transaction: t,
      });

      return { user: newSuperAdmin, role: superAdminRole };
    });

    const data = {
      userId: result.user.userId,
      name: `${result.user.firstName} ${result.user.lastName}`,
      email: result.user.email,
      mobileNumber: result.user.mobileNumber,
      role: result.role.roleName,
    };

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
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      201,
      true,
      "Super Admin account created successfully",
      data
    );
  } catch (error) {
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
      requestStartTime
    );

    return next(error);
  }
});

const reassignProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { userId } = req.body;

  const requestBodyLog = {
    propertyId,
    targetUserId: userId,
    reassignedBy: req.user.userId,
    reassignerRole: req.user.role,
  };

  try {
    if (!userId) {
      throw createAppError("userId is required", 400);
    }

    const property = await Property.findOne({
      where: { propertyId, isActive: true },
    });

    if (!property) {
      throw createAppError("Property not found", 404);
    }

    const isSalesPerson = ["Sales Manager", "Sales Executive"].includes(
      req.user.role
    );
    const isAdmin = ["Admin", "Super Admin"].includes(req.user.role);

    if (isSalesPerson) {
      if (property.salesId !== req.user.userId) {
        throw createAppError(
          "You can only reassign properties assigned to you",
          403
        );
      }
    } else if (!isAdmin) {
      throw createAppError(
        "You do not have permission to reassign properties",
        403
      );
    }

    if (userId === property.salesId) {
      throw createAppError("Property is already assigned to this user", 400);
    }

    const targetUser = await User.findOne({
      where: { userId, isActive: true },
      attributes: ["userId", "firstName", "lastName", "email"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleName"],
          where: {
            roleName: { [Op.in]: ["Sales Manager", "Sales Executive"] },
            isActive: true,
          },
          required: true,
        },
      ],
    });

    if (!targetUser) {
      throw createAppError(
        "Target user not found, inactive, or not a Sales Manager/Executive",
        404
      );
    }

    const oldSalesId = property.salesId;
    const oldRecord = property.toJSON();

    const result = await sequelize.transaction(async (t) => {
      await property.update({ salesId: userId }, { transaction: t });

      const { oldValues, newValues } = buildUpdateValues(oldRecord, {
        salesId: userId,
      });
      newValues.reassignedBy = req.user.userId;

      await logUpdate({
        userId: req.user.userId,
        entityType: "Property",
        recordId: propertyId,
        oldValues,
        newValues,
        tableName: "properties",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        transaction: t,
      });

      return property;
    });

    try {
      const io = getIO();
      io.to(`user:${userId}`).emit("property:assigned", {
        propertyId,
        city: result.city,
        state: result.state,
        propertyType: result.propertyType,
        assignedBy: req.user.userId,
        timestamp: new Date().toISOString(),
      });
      if (oldSalesId && oldSalesId !== req.user.userId) {
        io.to(`user:${oldSalesId}`).emit("property:unassigned", {
          propertyId,
          city: result.city,
          state: result.state,
          propertyType: result.propertyType,
          reassignedBy: req.user.userId,
          reassignedTo: userId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (socketErr) {
      console.error("Socket notification failed:", socketErr.message);
    }

    const data = {
      propertyId,
      previousSalesId: oldSalesId,
      newSalesId: userId,
      reassignedTo: `${targetUser.firstName} ${targetUser.lastName}`,
    };

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Property reassigned successfully",
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Property reassigned successfully",
      data
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

const getAllActiveSalesManagers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const requestBodyLog = {
    requestedBy: req.userRole,
  };

  try {
    // Only Admin and Super Admin can access this endpoint
    if (req.userRole !== "Admin" && req.userRole !== "Super Admin") {
      throw createAppError(
        "Access denied. Only Admin or Super Admin can fetch sales managers",
        403
      );
    }

    const salesManagers = await User.findAll({
      where: { isActive: true },
      attributes: ["userId", "firstName", "lastName", "email", "mobileNumber"],
      include: [
        {
          model: Role,
          as: "roles",
          where: { roleName: "Sales Manager", isActive: true },
          through: { attributes: [] },
          attributes: ["roleName"],
        },
      ],
      order: [
        ["firstName", "ASC"],
        ["lastName", "ASC"],
      ],
    });

    const formattedManagers = salesManagers.map((manager) => ({
      value: manager.userId,
      label: `${manager.firstName} ${manager.lastName}`,
      email: manager.email,
      mobileNumber: manager.mobileNumber,
    }));

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Sales managers fetched successfully",
          count: formattedManagers.length,
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Sales managers fetched successfully",
      formattedManagers
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

module.exports = {
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  createSuperAdmin,
  reassignProperty,
  getAllActiveSalesManagers,
};
