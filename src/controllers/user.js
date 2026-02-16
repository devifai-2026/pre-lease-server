const { Op } = require("sequelize");
const { User, Role, UserRole, Token } = require("../models/index");
const {
  isValidEmail,
  isValidPhone,
  validateRequiredFields,
} = require("../utils/validators");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const otpService = require("../services/otpService");

// ============================================
// SEND OTP
// ============================================
const sendOtpHandler = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { mobileNumber } = req.body;

  const requestBodyLog = {
    mobileNumber,
  };

  try {
    if (!mobileNumber) {
      throw createAppError("mobileNumber is required", 400);
    }

    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    const result = await otpService.sendOtp(mobileNumber);

    await logRequest(
      req,
      {
        userId: null,
        status: 200,
        body: { success: true, message: "OTP sent successfully" },
        requestBodyLog: { mobileNumber: "[REDACTED]" },
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, "OTP sent successfully", {
      verificationId: result.verificationId,
      timeout: result.timeout,
    });
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

// ============================================
// SIGNUP
// ============================================
const signup = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const {
    mobileNumber,
    email,
    firstName,
    lastName,
    reraNumber,
    roleName,
    otp,
    verificationId,
  } = req.body;

  // Prepare log-safe request body (redact sensitive data)
  const requestBodyLog = {
    email, // ✅ Keep email for failure tracking
    mobileNumber, // ✅ Keep mobile for failure tracking
    firstName,
    lastName,
    reraNumber,
    roleName,
    otp: otp ? "[REDACTED]" : null,
    verificationId: verificationId ? "[PRESENT]" : null,
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
  };

  try {
    // Validate required fields
    const requiredFields = [
      "mobileNumber",
      "email",
      "firstName",
      "lastName",
      "otp",
      "verificationId",
    ];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      throw createAppError("Invalid email format", 400);
    }

    // Validate mobile number (10 digits, starts with 6-9)
    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    // Verify OTP via MessageCentral
    await otpService.verifyOtp(verificationId, otp);

    // Build where condition dynamically to avoid undefined values
    const whereConditions = [{ mobileNumber }, { email }];

    // Only add reraNumber to condition if it's provided
    if (reraNumber) {
      whereConditions.push({ reraNumber });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: whereConditions,
      },
      attributes: [
        "mobileNumber",
        "email",
        "reraNumber",
        "otp",
        "otpExpiresAt",
      ],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw createAppError("Email already exists", 409);
      } else if (existingUser.mobileNumber === mobileNumber) {
        throw createAppError("Mobile number already exists", 409);
      } else if (reraNumber && existingUser.reraNumber === reraNumber) {
        throw createAppError("Rera number already exists", 409);
      }
    }

    // Find role from roles table
    const roleRecord = await Role.findOne({
      where: {
        roleName: roleName || "Broker",
        roleType: "client",
        isActive: true,
      },
    });

    if (!roleRecord) {
      throw createAppError(
        "Invalid role. Please choose: Owner, Investor, or Broker",
        400
      );
    }

    // Start transaction
    const result = await sequelize.transaction(async (t) => {
      // Create user (✅ with otp and otpExpiresAt as null after verification)
      const createUser = await User.create(
        {
          firstName,
          lastName,
          email,
          mobileNumber,
          userType: "client",
          isActive: true,
          reraNumber: reraNumber || null,
        },
        { transaction: t }
      );

      // Create user role
      await UserRole.create(
        {
          userId: createUser.userId,
          roleId: roleRecord.roleId,
          assignedBy: null,
        },
        { transaction: t }
      );

      // Create refresh token
      const tokenRecord = await Token.create(
        {
          userId: createUser.userId,
          refreshToken: Token.generateRefreshToken(
            createUser.userId,
            roleRecord.roleName
          ),
          expiresAt: Token.calculateExpiryDate(
            process.env.REFRESH_TOKEN_EXPIRY
          ),
          deviceId: req.body.deviceId || null,
          userAgent: req.headers["user-agent"] || null,
          ipAddress: req.ip || null,
          isActive: true,
        },
        { transaction: t }
      );

      return {
        user: createUser,
        role: roleRecord,
        refreshToken: tokenRecord.refreshToken,
      };
    });

    const accessToken = Token.generateAccessToken(
      result.user.userId,
      result.role.roleName
    );

    const data = {
      userId: result.user.userId,
      role: result.role.roleName,
      accessToken,
      refreshToken: result.refreshToken,
    };

    // ✅ Log successful API request
    await logRequest(
      req,
      {
        userId: result.user.userId,
        status: 201,
        body: { success: true, message: "User created successfully" },
        requestBodyLog: {
          ...requestBodyLog,
          email: "[SUCCESS]", // ✅ Redact on success
          mobileNumber: "[SUCCESS]", // ✅ Redact on success
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
    // ✅ Log failed API request (keep email/mobile for support)
    await logRequest(
      req,
      {
        userId: null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        requestBodyLog, // ✅ Keep email/mobile for failure investigation
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );

    // Pass error to error handler middleware
    return next(error);
  }
});

// ============================================
// LOGIN
// ============================================
const login = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { mobileNumber, otp, roleName, verificationId } = req.body;

  // Prepare log-safe request body
  const requestBodyLog = {
    mobileNumber, // ✅ Keep mobile for failure tracking
    otp: otp ? "[REDACTED]" : null,
    verificationId: verificationId ? "[PRESENT]" : null,
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
    roleName,
  };

  try {
    // Validate required fields
    const requiredFields = ["mobileNumber", "otp", "verificationId"];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

    // Validate mobile number
    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    // Verify OTP via MessageCentral
    await otpService.verifyOtp(verificationId, otp);

    // Check if user exists
    const existingUser = await User.findOne({
      where: { mobileNumber, isActive: true },
      attributes: [
        "mobileNumber",
        "userId",
        "userType",
        "firstName",
        "lastName",
        "email",
      ],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName", "roleType"],
          where: { isActive: true },
        },
      ],
    });

    if (!existingUser) {
      throw createAppError("Account does not exist, please sign up first", 404);
    }

    if (!existingUser.roles || existingUser.roles.length === 0) {
      throw createAppError("No active role assigned to this account", 403);
    }

    // Determine active role for this login session
    let activeRoleName = existingUser.roles[0].roleName;

    // If roleName is provided and it's a client role, add it if not already assigned
    if (roleName && existingUser.userType === "client") {
      const validClientRoles = ["Owner", "Broker", "Investor"];
      if (!validClientRoles.includes(roleName)) {
        throw createAppError(
          "Invalid role. Please choose: Owner, Investor, or Broker",
          400
        );
      }

      const alreadyHasRole = existingUser.roles.some(
        (r) => r.roleName === roleName
      );

      if (!alreadyHasRole) {
        // Find the role record
        const newRoleRecord = await Role.findOne({
          where: { roleName, roleType: "client", isActive: true },
        });

        if (!newRoleRecord) {
          throw createAppError("Role not found or inactive", 400);
        }

        await UserRole.create({
          userId: existingUser.userId,
          roleId: newRoleRecord.roleId,
          assignedBy: null,
        });
      }

      activeRoleName = roleName;
    }

    // Generate new refresh token
    const refreshToken = Token.generateRefreshToken(
      existingUser.userId,
      activeRoleName
    );

    // Update existing token or create new one
    const [updatedCount] = await Token.update(
      {
        refreshToken,
        expiresAt: Token.calculateExpiryDate(process.env.REFRESH_TOKEN_EXPIRY),
        deviceId: req.body.deviceId || null,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        isActive: true,
        lastUsedAt: new Date(),
      },
      {
        where: {
          userId: existingUser.userId,
          isActive: true,
        },
      }
    );

    const lastLoginAt = new Date();
    await User.update({ lastLoginAt }, { where: { mobileNumber } });

    // If no active token found, create new one
    if (updatedCount === 0) {
      await Token.create({
        userId: existingUser.userId,
        refreshToken,
        expiresAt: Token.calculateExpiryDate(process.env.REFRESH_TOKEN_EXPIRY),
        deviceId: req.body.deviceId || null,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        isActive: true,
      });
    }

    // Generate access token
    const accessToken = Token.generateAccessToken(
      existingUser.userId,
      activeRoleName
    );

    // Build roles array from existing roles + newly added role (if any)
    const allRoles = existingUser.roles.map((r) => r.roleName);
    if (roleName && !allRoles.includes(roleName)) {
      allRoles.push(roleName);
    }

    const data = {
      userId: existingUser.userId,
      role: activeRoleName,
      roles: allRoles,
      accessToken,
      refreshToken,
      name: `${existingUser.firstName} ${existingUser.lastName}`,
      email: existingUser.email,
    };

    // ✅ Log successful API request
    await logRequest(
      req,
      {
        userId: existingUser.userId,
        status: 200,
        body: { success: true, message: "Login successfully" },
        requestBodyLog: {
          mobileNumber: "[SUCCESS]", // ✅ Redact on success
          deviceId: "[REDACTED]",
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, "Login successfully", data);
  } catch (error) {
    // ✅ Log failed API request (keep mobile for support)
    await logRequest(
      req,
      {
        userId: null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        requestBodyLog, // ✅ Keep mobile for failure investigation
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );

    // Pass error to error handler middleware
    return next(error);
  }
});

// ============================================
// LOGOUT
// ============================================
const logout = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    // Extract refresh token from Authorization header
    const authHeader = req.headers.authorization;
    const refreshToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

    if (!refreshToken) {
      throw createAppError(
        "Refresh token is required in Authorization header",
        401
      );
    }

    // Revoke the token
    const revoked = await Token.revokeToken(refreshToken, "logout");

    if (!revoked) {
      throw createAppError("Token not found or already revoked", 400);
    }

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: { success: true, message: "Logged out successfully" },
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, "Logged out successfully", null);
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
// REFRESH ACCESS TOKEN
// ============================================
/**
 * @route   GET /api/v1/auth/refresh-token
 * @desc    Generate new access token using valid refresh token
 * @access  Public (requires valid refresh token in Authorization header)
 * @header  Authorization: Bearer <refreshToken>
 * @returns New access token with user details
 */
const refreshAccessToken = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  // Extract refresh token from Authorization header
  const authHeader = req.headers.authorization;
  const refreshToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

  // Prepare log-safe request body
  const requestBodyLog = {
    endpoint: "/api/v1/auth/refresh-token",
    hasRefreshToken: !!refreshToken,
    refreshToken: refreshToken ? "[REDACTED]" : null,
  };

  try {
    if (!refreshToken) {
      throw createAppError(
        "Refresh token is required in Authorization header",
        401
      );
    }

    // ============================================
    // VERIFY REFRESH TOKEN FROM DATABASE
    // ============================================
    // Check if refresh token exists in database and is valid
    const verification = await Token.verifyRefreshToken(refreshToken);

    if (!verification.valid) {
      throw createAppError(
        verification.message || "Invalid or expired refresh token",
        401
      );
    }

    // Extract decoded payload and token record
    const { decoded, token: tokenRecord } = verification;

    const user = await User.findOne({
      where: { userId: decoded._id, isActive: true },
      attributes: ["userId", "firstName", "lastName", "email", "mobileNumber"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName", "roleType"],
          where: { isActive: true },
        },
      ],
    });

    // Check if user exists and is active
    if (!user) {
      throw createAppError("User not found or account deactivated", 404);
    }

    // Check if user has active role
    if (!user.roles || user.roles.length === 0) {
      throw createAppError("No active role assigned to this account", 403);
    }

    // Respect the role from JWT if still valid, otherwise fallback
    const activeRoleName =
      decoded.role && user.roles.some((r) => r.roleName === decoded.role)
        ? decoded.role
        : user.roles[0].roleName;

    const newAccessToken = Token.generateAccessToken(
      user.userId,
      activeRoleName
    );

    // Track when refresh token was last used
    await Token.update(
      { lastUsedAt: new Date() },
      { where: { tokenId: tokenRecord.tokenId } }
    );

    const data = {
      userId: user.userId,
      role: activeRoleName,
      accessToken: newAccessToken,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    };

    await logRequest(
      req,
      {
        userId: user.userId,
        status: 200,
        body: {
          success: true,
          message: "Access token refreshed successfully",
        },
        requestBodyLog: {
          ...requestBodyLog,
          userId: user.userId,
          role: activeRoleName,
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Access token refreshed successfully",
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

const switchRole = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { roleName } = req.body;

  const requestBodyLog = {
    userId: req.user?.userId,
    requestedRole: roleName,
    currentRole: req.user?.role,
  };

  try {
    if (!roleName) {
      throw createAppError("roleName is required", 400);
    }

    // Only client roles can be switched
    const validClientRoles = ["Owner", "Broker", "Investor"];
    if (!validClientRoles.includes(roleName)) {
      throw createAppError(
        "Only client roles (Owner, Broker, Investor) can be switched",
        400
      );
    }

    const targetRole = req.user.roles.find((r) => r.roleName === roleName);

    if (!targetRole) {
      throw createAppError(
        `You do not have the role '${roleName}'. Available roles: ${req.user.roles.filter((r) => validClientRoles.includes(r.roleName)).map((r) => r.roleName).join(", ")}`,
        403
      );
    }

    if (req.user.role === roleName) {
      throw createAppError(`'${roleName}' is already your active role`, 400);
    }

    const newAccessToken = Token.generateAccessToken(
      req.user.userId,
      roleName
    );

    const newRefreshToken = Token.generateRefreshToken(
      req.user.userId,
      roleName
    );

    const [updatedCount] = await Token.update(
      {
        refreshToken: newRefreshToken,
        expiresAt: Token.calculateExpiryDate(process.env.REFRESH_TOKEN_EXPIRY),
        lastUsedAt: new Date(),
      },
      {
        where: { userId: req.user.userId, isActive: true },
      }
    );

    if (updatedCount === 0) {
      await Token.create({
        userId: req.user.userId,
        refreshToken: newRefreshToken,
        expiresAt: Token.calculateExpiryDate(process.env.REFRESH_TOKEN_EXPIRY),
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        isActive: true,
      });
    }

    const data = {
      userId: req.user.userId,
      previousRole: req.user.role,
      activeRole: roleName,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "Role switched successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Role switched successfully",
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

const verifyOtpHandler = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { otp, verificationId } = req.body;

  const requestBodyLog = {
    otp: "[REDACTED]",
    verificationId,
  };

  try {
    if (!otp || !verificationId) {
      throw createAppError("otp and verificationId are required", 400);
    }

    // Verify OTP via MessageCentral
    await otpService.verifyOtp(verificationId, otp);

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: { success: true, message: "OTP verified successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "OTP verified successfully",
      null
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
  sendOtpHandler,
  verifyOtpHandler,
  signup,
  login,
  logout,
  refreshAccessToken,
  switchRole,
};
