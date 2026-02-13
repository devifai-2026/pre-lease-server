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

// ============================================
// SIGNUP
// ============================================
const signup = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const {
    mobileNumber,
    email,
    firstName,
    lastName,
    reraNumber,
    roleName,
    otp,
  } = req.body;

  // Prepare log-safe request body (redact sensitive data)
  const requestBodyLog = {
    email, // ✅ Keep email for failure tracking
    mobileNumber, // ✅ Keep mobile for failure tracking
    firstName,
    lastName,
    reraNumber,
    roleName,
    otp: otp ? "[REDACTED]" : null, // ✅ Don't log OTP
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
  };

  return (async () => {
    try {
      // Validate required fields
      const requiredFields = [
        "mobileNumber",
        "email",
        "firstName",
        "lastName",
        "otp",
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

      // ✅ Validate OTP (static 1111 for now)
      if (otp !== "1111") {
        throw createAppError("Invalid OTP entered", 400);
      }

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
            otp: null, // ✅ Set to null after successful verification
            otpExpiresAt: null, // ✅ Set to null after successful verification
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
        requestStartTime,
        next
      );

      // Pass error to error handler middleware
      return next(error);
    }
  })().catch(next);
});

// ============================================
// LOGIN
// ============================================
const login = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const { mobileNumber, otp } = req.body;

  // Prepare log-safe request body
  const requestBodyLog = {
    mobileNumber, // ✅ Keep mobile for failure tracking
    otp: otp ? "[REDACTED]" : null, // ✅ Don't log OTP
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
  };

  return (async () => {
    try {
      // Validate required fields
      const requiredFields = ["mobileNumber", "otp"];
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

      // ✅ Validate OTP (static 1111 for now)
      if (otp !== "1111") {
        throw createAppError("Invalid OTP entered", 400);
      }

      // Check if user exists
      const existingUser = await User.findOne({
        where: { mobileNumber, isActive: true },
        attributes: [
          "mobileNumber",
          "userId",
          "userType",
          "otp",
          "otpExpiresAt",
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
        throw createAppError(
          "Account does not exist, please sign up first",
          404
        );
      }

      if (!existingUser.roles || existingUser.roles.length === 0) {
        throw createAppError("No active role assigned to this account", 403);
      }

      const userRole = existingUser.roles[0];

      // ✅ Clear OTP and otpExpiresAt after successful verification
      await User.update(
        { otp: null, otpExpiresAt: null },
        { where: { userId: existingUser.userId } }
      );

      // Generate new refresh token
      const refreshToken = Token.generateRefreshToken(
        existingUser.userId,
        userRole.roleName
      );

      // Update existing token or create new one
      const [updatedCount] = await Token.update(
        {
          refreshToken,
          expiresAt: Token.calculateExpiryDate(
            process.env.REFRESH_TOKEN_EXPIRY
          ),
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
          expiresAt: Token.calculateExpiryDate(
            process.env.REFRESH_TOKEN_EXPIRY
          ),
          deviceId: req.body.deviceId || null,
          userAgent: req.headers["user-agent"] || null,
          ipAddress: req.ip || null,
          isActive: true,
        });
      }

      // Generate access token
      const accessToken = Token.generateAccessToken(
        existingUser.userId,
        userRole.roleName
      );

      const data = {
        userId: existingUser.userId,
        role: userRole.roleName,
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
        requestStartTime,
        next
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
        requestStartTime,
        next
      );

      // Pass error to error handler middleware
      return next(error);
    }
  })().catch(next);
});

module.exports = { signup, login };
