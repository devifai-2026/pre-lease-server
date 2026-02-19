const { Op } = require("sequelize");
const {
  User,
  Role,
  UserRole,
  Property,
  SalesRelationship,
  PropertyNotificationEvent,
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

// Helper constant for Sales Executive roles
const SALES_EXECUTIVE_ROLES = [
  "Sales Executive - Property Manager",
  "Sales Executive - Client Dealer",
];

const createUser = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { firstName, lastName, email, mobileNumber, roleName, salesManagerId } =
    req.body;

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

    // Sales Manager role-specific validations
    if (req.userRole === "Sales Manager") {
      // Sales Manager can ONLY create Sales Executive sub-roles
      if (!SALES_EXECUTIVE_ROLES.includes(roleName)) {
        throw createAppError(
          `Sales Manager can only create users with roles: ${SALES_EXECUTIVE_ROLES.join(" or ")}`,
          403
        );
      }

      // Sales Executive will be automatically assigned to the Sales Manager creating them
      // No need for salesManagerId in request body for Sales Manager
    }

    //  If creating Sales Executive, validate salesManagerId requirement
    if (SALES_EXECUTIVE_ROLES.includes(roleName)) {
      if (req.userRole === "Admin" || req.userRole === "Super Admin") {
        // Admin/Super Admin MUST provide salesManagerId
        if (!salesManagerId) {
          throw createAppError(
            "salesManagerId is required when creating Sales Executive users",
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

      // Create SalesRelationship if creating any Sales Executive sub-role
      let salesRelationship = null;
      if (SALES_EXECUTIVE_ROLES.includes(roleName)) {
        // If creator is Sales Manager, assign to themselves
        // If creator is Admin/Super Admin, assign to the provided salesManagerId
        const managerUserId =
          req.userRole === "Sales Manager" ? req.user.userId : salesManagerId;

        // Double check validation for safety (though validated above)
        if (!managerUserId) {
          throw createAppError("Sales Executive must be assigned to a Sales Manager", 400);
        }

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
          }),
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
      }),
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
    } else {
      // not to send the inactive users 
      whereClause.isActive = true;
    }

    const roleWhere = {};
    if (roleName) {
      roleWhere.roleName = roleName;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    // If user is NOT Admin or Super Admin, hide Admin/Super Admin users
    if (req.userRole !== "Admin" && req.userRole !== "Super Admin") {
      roleWhere.roleName = { [Op.notIn]: ["Admin", "Super Admin"] };
    }

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
        body: {
          success: true,
          message: "Users fetched successfully",
          count: formattedUsers.length,
        },
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

    // Check if user has Sales Manager or any Sales Executive sub-role
    const isSalesPerson = ["Sales Manager", ...SALES_EXECUTIVE_ROLES].includes(
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

    // Target user can be Sales Manager or any Sales Executive sub-role
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
            roleName: {
              [Op.in]: ["Sales Manager", "Sales Executive - Property Manager"],
            },
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

const getAllSalesRelatedActiveUsers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { roleName } = req.params; // ✅ Pass role as param: /:roleName (client-dealer, property-manager, sales-manager)
  const requestBodyLog = {
    requestedBy: req.userRole,
    roleName,
  };

  try {
    // Admin, Super Admin, and Sales Manager can access this endpoint
    const allowedRoles = ["Admin", "Super Admin", "Sales Manager"];
    if (!allowedRoles.includes(req.userRole)) {
      throw createAppError(
        "Access denied. Only Admin, Super Admin, or Sales Manager can fetch assignable users",
        403
      );
    }

    // ✅ Validate roleName
    const validRoles = [
      "Sales Executive - Property Manager",
      "Sales Manager",
      "Sales Executive - Client Dealer",
    ];

    if (!validRoles.includes(roleName)) {
      throw createAppError(
        `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        400
      );
    }

    const assignableUsers = await User.findAll({
      where: { isActive: true },
      attributes: ["user_id", "firstName", "lastName", "email", "mobileNumber"],
      include: [
        {
          model: Role,
          as: "roles",
          where: {
            roleName: roleName, // ✅ Exact role match
            isActive: true,
          },
          through: { attributes: [] },
          attributes: ["roleName"],
        },
      ],
      order: [
        ["firstName", "ASC"],
        ["lastName", "ASC"],
      ],
    });

    const formattedUsers = assignableUsers.map((user) => ({
      value: user.user_id,
      label: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobileNumber: user.mobileNumber,
    }));

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: `${roleName} users fetched successfully`,
          count: formattedUsers.length,
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      `${roleName} users fetched successfully`,
      formattedUsers
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

const verifyProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;

  const requestBodyLog = {
    propertyId,
    verifiedBy: req.user.userId,
    userRole: req.userRole,
  };

  try {
    const property = await Property.findOne({
      where: { propertyId, isActive: true },
      include: [
        { model: User, as: "owner", attributes: ["firstName", "lastName"] },
        { model: User, as: "salesAgent", attributes: ["firstName", "lastName"] },
      ],
    });

    if (!property) {
      throw createAppError("Property not found", 404);
    }

    const isAssignedSales =
      property.salesId === req.user.userId &&
      req.userRole === "Sales Executive - Property Manager";
    const isAdmin = ["Admin", "Super Admin"].includes(req.userRole);

    if (!isAssignedSales && !isAdmin) {
      throw createAppError(
        "You do not have permission to verify this property",
        403
      );
    }

    await sequelize.transaction(async (t) => {
      await property.update({ isVerified: "partial" }, { transaction: t });
      await logUpdate({
        userId: req.user.userId,
        entityType: "Property",
        recordId: propertyId,
        oldValues: { isVerified: property.isVerified },
        newValues: { isVerified: "partial" },
        tableName: "properties",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        transaction: t,
      });
    });

    try {
      const io = getIO();
      const ownerName = property.owner
        ? `${property.owner.firstName} ${property.owner.lastName}`
        : "Unknown Owner";
      const salesExecName = property.salesAgent
        ? `${property.salesAgent.firstName} ${property.salesAgent.lastName}`
        : "Sales Executive";
      const message = `${salesExecName} has verified ${ownerName}'s property in ${property.city}`;

      const admins = await User.findAll({
        include: [
          {
            model: Role,
            as: "roles",
            where: { roleName: { [Op.in]: ["Admin", "Super Admin"] } },
            through: { attributes: [] },
          },
        ],
        attributes: ["userId"],
        raw: true,
      });
      const adminIds = admins.map((a) => a.userId);

      let salesManagerId = null;
      if (property.salesId) {
        const relationship = await SalesRelationship.findOne({
          where: { salesExecutiveId: property.salesId, isActive: true },
        });
        if (relationship) salesManagerId = relationship.salesManagerId;
      }

      const recipients = new Set([...adminIds, salesManagerId]);
      recipients.delete(null);
      recipients.delete(undefined);

      const notificationRecords = [];
      const timestamp = new Date().toISOString();

      for (const recipientId of recipients) {
        notificationRecords.push({
          propertyId: property.propertyId,
          userId: recipientId,
          notificationText: message,
        });

        io.to(`user:${recipientId}`).emit("property:verified", {
          propertyId: property.propertyId,
          message,
          timestamp,
        });
      }

      if (notificationRecords.length > 0) {
        await PropertyNotificationEvent.bulkCreate(notificationRecords);
      }
    } catch (err) {
      console.error("Notification failed in verifyProperty:", err.message);
    }

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "Property verified successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Property verified successfully",
      { propertyId: property.propertyId, isVerified: "partial" }
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



const getAllSalesManagers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    const salesManagers = await User.findAll({
      where: { isActive: true },
      attributes: ["userId", "firstName", "lastName", "email"],
      include: [
        {
          model: Role,
          as: "roles",
          where: { roleName: "Sales Manager", isActive: true },
          through: { attributes: [] },
          attributes: [],
        },
      ],
      order: [["firstName", "ASC"]],
    });

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Sales Managers fetched successfully",
          count: salesManagers.length,
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Sales Managers fetched successfully",
      salesManagers
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 500,
        body: { success: false, message: error.message },
        error: error.message,
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
  getAllSalesRelatedActiveUsers,
  verifyProperty,
  getAllSalesManagers,
};
