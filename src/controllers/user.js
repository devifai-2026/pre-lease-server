const { Op } = require("sequelize");
const { User, Role, UserRole, Token, BrokerProfile } = require("../models/index");
const { autoAssignRole } = require("../utils/roleHelper");
const {
  isValidEmail,
  isValidPhone,
  validateRequiredFields,
  getPagination,
} = require("../utils/validators");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { logRequest, logUpdate } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const otpService = require("../services/otpService");

// OTP length is 4 digits across the whole product.
const OTP_LENGTH = 4;
// Fixed bypass code used for admin logins and local development.
const DUMMY_OTP = "1111";
const isDevelopment = process.env.NODE_ENV === "development";

// Admin frontends authenticate with the fixed DUMMY_OTP (no real SMS), while the
// consumer app uses real MessageCentral OTP in production. We tell them apart by
// the request Origin/Referer. Admin origins are configurable via env
// (ADMIN_ORIGINS, comma-separated) and default to the known admin host.
const ADMIN_ORIGINS = (process.env.ADMIN_ORIGINS ||
  "https://admin.preleasegrid.com")
  .split(",")
  .map((o) => o.trim().toLowerCase())
  .filter(Boolean);

const isAdminOrigin = (req) => {
  const src = (req.headers.origin || req.headers.referer || "").toLowerCase();
  if (!src) return false;
  return ADMIN_ORIGINS.some((o) => src.startsWith(o));
};

// The fixed DUMMY_OTP is accepted when the request is from an admin frontend, or
// in local development. Consumer (production) requests must verify via the real
// OTP service.
const isDummyOtpAllowed = (otp, req) =>
  otp === DUMMY_OTP && (isDevelopment || isAdminOrigin(req));

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
    // Admin frontends (and local dev) skip the real SMS send and get a dummy
    // verificationId so the fixed DUMMY_OTP works — no SMS cost. The consumer app
    // in production sends a real OTP via MessageCentral.
    const result =
      isDevelopment || isAdminOrigin(req)
        ? { verificationId: "dummy_id", timeout: "60.0" }
        : await otpService.sendOtp(mobileNumber);

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
    otp,
    verificationId,
    joinType,          // "investor" or "broker"
    // Broker-only fields
    reraNumber,
    companyName,
    locality,
    specializations: rawSpecializations,
    dealsClosed,
  } = req.body;

  const requestBodyLog = {
    email,
    mobileNumber,
    firstName,
    lastName,
    joinType,
    reraNumber,
    otp: otp ? "[REDACTED]" : null,
    verificationId: verificationId ? "[PRESENT]" : null,
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
  };

  try {
    // ── Required base fields ──────────────────────────────────────────────────
    const missing = validateRequiredFields(
      ["mobileNumber", "email", "firstName", "lastName", "otp", "verificationId", "joinType"],
      req.body
    );
    if (missing.length > 0) {
      throw createAppError(`Missing required fields: ${missing.join(", ")}`, 400);
    }

    if (!["investor", "broker"].includes(joinType)) {
      throw createAppError('joinType must be "investor" or "broker"', 400);
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

    // ── Broker-specific required fields ───────────────────────────────────────
    if (joinType === "broker") {
      const brokerMissing = validateRequiredFields(
        ["locality", "specializations", "dealsClosed"],
        req.body
      );
      if (brokerMissing.length > 0) {
        throw createAppError(
          `Broker signup requires: ${brokerMissing.join(", ")}`,
          400
        );
      }
      // RERA number is optional at signup and accepted in any format
      // (formats vary widely by state), so no format validation is applied.
    }

    // ── Verify OTP ────────────────────────────────────────────────────────────
    if (!isDummyOtpAllowed(otp, req)) {
      await otpService.verifyOtp(verificationId, otp);
    }

    // ── Check for duplicate email / reraNumber across other users ──────────────
    const conflictUser = await User.findOne({
      where: {
        [Op.or]: [
          { email },
          { reraNumber: reraNumber || "__none__" }, // dummy to avoid null match
        ],
        mobileNumber: { [Op.ne]: mobileNumber }, // Exclude current user if any
      },
      attributes: ["email", "reraNumber"],
    });

    if (conflictUser) {
      if (conflictUser.email === email) {
        throw createAppError("Email already exists", 409);
      }
      if (reraNumber && conflictUser.reraNumber === reraNumber) {
        throw createAppError("RERA number already exists", 409);
      }
    }

    // ── Check existing mobile ────────────────────────────────────────────────
    let existingUser = await User.findOne({
      where: { mobileNumber },
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleName"],
        },
      ],
    });

    if (existingUser) {
      const roleNames = (existingUser.roles || []).map((r) => r.roleName);
      if (joinType === "broker" && roleNames.includes("Broker")) {
        throw createAppError("An account with this mobile number already exists as a broker", 409);
      }
      if (joinType === "investor" && (roleNames.includes("Investor") || existingUser.isGuest)) {
        throw createAppError("An account with this mobile number already exists as an investor", 409);
      }
      // If we are here, user exists but is missing the role they are signing up for.
      // This is "allowed" as per user request (e.g. Investor signing up as Broker).
    }

    // ── Parse specializations for broker ──────────────────────────────────────
    let specializations = rawSpecializations;
    if (joinType === "broker") {
      if (typeof specializations === "string") {
        try {
          specializations = JSON.parse(specializations);
        } catch {
          specializations = specializations.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
      if (!Array.isArray(specializations) || specializations.length === 0) {
        throw createAppError("At least one specialization is required", 400);
      }
    }

    // ── Transaction ───────────────────────────────────────────────────────────
    const result = await sequelize.transaction(async (t) => {
      let targetUser;

      if (existingUser) {
        // Upgrade existing user
        targetUser = existingUser;
        targetUser.firstName = firstName || targetUser.firstName;
        targetUser.lastName = lastName || targetUser.lastName;
        targetUser.email = email || targetUser.email;
        if (joinType === "broker") {
          targetUser.isVerified = false; // Broker needs verification
          targetUser.reraNumber = reraNumber || targetUser.reraNumber;
          targetUser.joinType = "broker"; // Primary joinType becomes broker
          targetUser.isGuest = false;
        }
        await targetUser.save({ transaction: t });
      } else {
        // Create new user
        targetUser = await User.create(
          {
            firstName,
            lastName,
            email,
            mobileNumber,
            userType: "client",
            isActive: true,
            isVerified: joinType === "broker" ? false : true,
            reraNumber: reraNumber || null,
            joinType,
            isGuest: joinType === "investor",
          },
          { transaction: t }
        );
      }

      let assignedRole = null;

      if (joinType === "broker") {
        // Find Broker role
        const brokerRole = await Role.findOne({
          where: { roleName: "Broker", isActive: true },
        });
        if (!brokerRole) throw createAppError("Broker role not configured", 500);

        await UserRole.create(
          {
            userId: targetUser.userId,
            roleId: brokerRole.roleId,
            assignedBy: null,
            assignedReason: "signup",
          },
          { transaction: t }
        );

        // Create broker profile
        await BrokerProfile.create(
          {
            userId: targetUser.userId,
            companyName: companyName || null,
            locality: String(locality).trim(),
            specializations,
            dealsClosed: parseInt(dealsClosed) || 0,
          },
          { transaction: t }
        );

        assignedRole = brokerRole.roleName;
      }
      // investor: no role assigned yet, isGuest = true

      const refreshTokenStr = Token.generateRefreshToken(
        targetUser.userId,
        assignedRole || "guest"
      );

      const tokenRecord = await Token.create(
        {
          userId: targetUser.userId,
          refreshToken: refreshTokenStr,
          expiresAt: Token.calculateExpiryDate(process.env.REFRESH_TOKEN_EXPIRY),
          deviceId: req.body.deviceId || null,
          userAgent: req.headers["user-agent"] || null,
          ipAddress: req.ip || null,
          isActive: true,
        },
        { transaction: t }
      );

      return {
        user: targetUser,
        roleName: assignedRole,
        refreshToken: tokenRecord.refreshToken,
      };
    });

    const accessToken = Token.generateAccessToken(
      result.user.userId,
      result.roleName || "guest"
    );

    const data = {
      userId: result.user.userId,
      joinType,
      isGuest: result.user.isGuest,
      roles: result.roleName ? [result.roleName] : [],
      accessToken,
      refreshToken: result.refreshToken,
      name: `${result.user.firstName} ${result.user.lastName}`,
      email: result.user.email,
      mobileNumber: result.user.mobileNumber,
    };

    await logRequest(
      req,
      {
        userId: result.user.userId,
        status: 201,
        body: { success: true, message: "User created successfully" },
        requestBodyLog: {
          ...requestBodyLog,
          email: "[SUCCESS]",
          mobileNumber: "[SUCCESS]",
        },
      },
      requestStartTime
    );

    // ── Notify admins on broker signup ────────────────────────────────────────
    if (joinType === "broker") {
      console.log(`[Signup] Broker registered: ${result.user.firstName} ${result.user.lastName}. Sending notifications to admins...`);
      try {
        const { getIO } = require("../config/socket");
        const io = getIO();
        const { PropertyNotificationEvent } = require("../models");
        const message = `Broker ${result.user.firstName} ${result.user.lastName} has registered and is pending verification`;

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
        });

        const notificationRecords = [
          {
            propertyId: null,
            userId: result.user.userId,
            title: "Registration Successful",
            notificationText:
              "Your broker account has been registered and is pending verification. Please login after some time.",
          },
        ];

        for (const admin of admins) {
          notificationRecords.push({
            propertyId: null,
            userId: admin.userId,
            title: "New Broker Registered",
            notificationText: message,
          });
          io.to(`user:${admin.userId}`).emit("broker:registered", {
            userId: result.user.userId,
            title: "New Broker Registered",
            message,
            timestamp: new Date().toISOString(),
          });
        }

        if (notificationRecords.length > 0) {
          await PropertyNotificationEvent.bulkCreate(notificationRecords);
        }
      } catch (err) {
        console.error("Broker signup notification failed:", err.message);
      }
    }

    return sendEncodedResponse(res, 201, true, "User created successfully", data);
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

    // Pass error to error handler middleware
    return next(error);
  }
});

// ============================================
// LOGIN
// ============================================
const login = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { mobileNumber, otp, verificationId } = req.body;

  const requestBodyLog = {
    mobileNumber,
    otp: otp ? "[REDACTED]" : null,
    verificationId: verificationId ? "[PRESENT]" : null,
    deviceId: req.body.deviceId ? "[REDACTED]" : null,
  };

  try {
    const missing = validateRequiredFields(
      ["mobileNumber", "otp", "verificationId"],
      req.body
    );
    if (missing.length > 0) {
      throw createAppError(`Missing required fields: ${missing.join(", ")}`, 400);
    }

    if (!isValidPhone(mobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    // TODO: Remove this after testing
    if (!isDummyOtpAllowed(otp, req)) {
      await otpService.verifyOtp(verificationId, otp);
    }

    // Find user — guest users (no roles yet) are allowed to log in
    const existingUser = await User.findOne({
      where: { mobileNumber, isActive: true },
      attributes: [
        "userId", "mobileNumber", "userType", "firstName", "lastName",
        "email", "joinType", "isGuest", "createdAt", "lastLoginAt",
      ],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName", "roleType"],
          where: { isActive: true },
          required: false, // guest users have no roles
        },
      ],
    });

    if (!existingUser) {
      throw createAppError("Account does not exist, please sign up first", 404);
    }

    const roles = existingUser.roles || [];
    const primaryRole = roles[0]?.roleName || "guest";

    // Admin / Super Admin accounts may sign in only from the admin frontend.
    // Block them on the consumer app so an admin number can't log in as
    // owner/investor/broker on the client side.
    const isStaffAccount = roles.some((r) =>
      ["Admin", "Super Admin"].includes(r.roleName)
    );
    if (isStaffAccount && !isAdminOrigin(req)) {
      throw createAppError(
        "This is an admin account. Please use the admin portal to sign in.",
        403
      );
    }

    const refreshToken = Token.generateRefreshToken(existingUser.userId, primaryRole);

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
      { where: { userId: existingUser.userId, isActive: true } }
    );

    await User.update({ lastLoginAt: new Date() }, { where: { mobileNumber } });

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

    const accessToken = Token.generateAccessToken(existingUser.userId, primaryRole);

    const data = {
      userId: existingUser.userId,
      joinType: existingUser.joinType,
      isGuest: existingUser.isGuest,
      roles: roles.map((r) => r.roleName),
      accessToken,
      refreshToken,
      name: `${existingUser.firstName} ${existingUser.lastName}`,
      email: existingUser.email,
      mobileNumber: existingUser.mobileNumber,
      // Real account dates so the UI can show "Joined on" / "Last log in".
      // lastLoginAt is the PRIOR login (it's updated to now() after this fetch).
      createdAt: existingUser.createdAt,
      lastLoginAt: existingUser.lastLoginAt,
    };

    await logRequest(
      req,
      {
        userId: existingUser.userId,
        status: 200,
        body: { success: true, message: "Login successfully" },
        requestBodyLog: { mobileNumber: "[SUCCESS]", deviceId: "[REDACTED]" },
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, "Login successfully", data);
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
      attributes: ["userId", "firstName", "lastName", "email", "mobileNumber", "joinType", "isGuest"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName", "roleType"],
          where: { isActive: true },
          required: false, // guest users have no roles
        },
      ],
    });

    if (!user) {
      throw createAppError("User not found or account deactivated", 404);
    }

    const roles = user.roles || [];
    const primaryRole = roles[0]?.roleName || "guest";

    const newAccessToken = Token.generateAccessToken(user.userId, primaryRole);

    await Token.update(
      { lastUsedAt: new Date() },
      { where: { tokenId: tokenRecord.tokenId } }
    );

    const data = {
      userId: user.userId,
      joinType: user.joinType,
      isGuest: user.isGuest,
      roles: roles.map((r) => r.roleName),
      accessToken: newAccessToken,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobileNumber: user.mobileNumber,
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
          role: primaryRole,
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


const getClientUsers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { page = 1, limit = 50, roleName, isActive } = req.query;

  const requestBodyLog = {
    page,
    limit,
    filters: { roleName, isActive },
  };

  try {
    const whereClause = { userType: "client", deletedAt: null };

    if (isActive !== undefined && isActive !== "all") {
      whereClause.isActive = isActive === "true";
    } else if (isActive === undefined) {
      whereClause.isActive = true;
    }

    const roleWhere = { roleType: "client", isActive: true };
    if (roleName) {
      roleWhere.roleName = roleName;
    }

    const { pageNumber, pageSize, offset } = getPagination(page, limit);

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
        "reraNumber",
        "isVerified",
      ],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleId", "roleName", "roleType"],
          where: roleWhere,
        },
        {
          model: BrokerProfile,
          as: "brokerProfile",
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset: offset,
      distinct: true,
    });

    const totalPages = Math.ceil(count / pageSize);
    const pagination = {
      currentPage: pageNumber,
      totalPages,
      totalUsers: count,
      hasNextPage: pageNumber < totalPages,
      hasPrevPage: pageNumber > 1,
      usersPerPage: pageSize,
    };

    const formattedUsers = users.map((user) => {
      const profile = user.brokerProfile;
      return {
        userId: user.userId,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.roles[0]?.roleName || null,
        isActive: user.isActive,
        createdAt: user.createdAt,
        reraNumber: user.reraNumber,
        isVerified: user.isVerified,
        brokerProfile: profile
          ? {
              companyName: profile.companyName,
              locality: profile.locality,
              specializations: profile.specializations,
              dealsClosed: profile.dealsClosed,
              profilePhoto: profile.profilePhoto,
            }
          : null,
      };
    });

    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: 200,
        body: {
          success: true,
          message: "Client users fetched successfully",
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
      "Client users fetched successfully",
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
    // TODO: Remove this after testing
    // await otpService.verifyOtp(verificationId, otp);
    if (!isDummyOtpAllowed(otp, req)) {
      await otpService.verifyOtp(verificationId, otp);
    }

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

// ============================================
// CHANGE MOBILE NUMBER
// ============================================
const changeMobileNumber = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { newMobileNumber, otp, verificationId, userId: targetUserId } = req.body;
  let userId = req.user.userId;
  const userRoleNames = req.user.roles.map((r) => r.roleName);

  // Allow Admins/Sales Managers to change another user's mobile number
  if (targetUserId && targetUserId !== req.user.userId) {
    const allowedRoles = ["Admin", "Super Admin", "Sales Manager"];
    const hasAllowedRole = userRoleNames.some((r) => allowedRoles.includes(r));
    if (!hasAllowedRole) {
      throw createAppError(
        "Only Admin, Super Admin, or Sales Manager can change another user's mobile number",
        403
      );
    }
    userId = targetUserId;
  }

  const requestBodyLog = {
    userId,
    newMobileNumber: newMobileNumber ? "[REDACTED]" : null,
    otp: otp ? "[REDACTED]" : null,
    verificationId: verificationId ? "[PRESENT]" : null,
  };

  try {
    // Validate required fields
    const missing = validateRequiredFields(
      ["newMobileNumber", "otp", "verificationId"],
      req.body
    );
    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

    // Validate new mobile number format
    if (!isValidPhone(newMobileNumber)) {
      throw createAppError(
        "Invalid mobile number. Must be 10 digits starting with 6-9",
        400
      );
    }

    // Check if new number already taken by another user
    const existingUser = await User.findOne({
      where: { mobileNumber: newMobileNumber },
      attributes: ["userId"],
    });
    if (existingUser) {
      throw createAppError(
        "Mobile number already in use by another account",
        409
      );
    }

    // Verify OTP
    // TODO: Remove this after testing
    // await otpService.verifyOtp(verificationId, otp);
    if (!isDummyOtpAllowed(otp, req)) {
      await otpService.verifyOtp(verificationId, otp);
    }

    // Start transaction
    const result = await sequelize.transaction(async (t) => {
      // Fetch target user for audit log old values and basic validation
      const targetUser = await User.findOne({
        where: { userId, isActive: true },
        attributes: ["userId", "mobileNumber"],
        transaction: t,
      });

      if (!targetUser) {
        throw createAppError("User not found or inactive", 404);
      }

      // Cannot be the same as current for the target user
      if (targetUser.mobileNumber === newMobileNumber) {
        throw createAppError(
          "New mobile number must be different from current mobile number",
          400
        );
      }

      const oldMobileNumber = targetUser.mobileNumber;

      // Update mobile number
      await User.update(
        { mobileNumber: newMobileNumber },
        { where: { userId }, transaction: t }
      );

      // Revoke old tokens for this user
      await Token.update(
        { isActive: false, revocationReason: "mobile_number_changed" },
        { where: { userId, isActive: true }, transaction: t }
      );

      // Determine primary role for the new token
      let targetPrimaryRole = userRoleNames[0] || "guest";
      if (userId !== req.user.userId) {
        const userRoles = await Role.findAll({
          include: [{ model: User, as: "users", where: { userId }, through: { attributes: [] } }],
        });
        targetPrimaryRole = userRoles.length > 0 ? userRoles[0].roleName : "guest";
      }

      const newRefreshTokenStr = Token.generateRefreshToken(
        userId,
        targetPrimaryRole
      );
      const newTokenRecord = await Token.create(
        {
          userId,
          refreshToken: newRefreshTokenStr,
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

      // Audit log
      await logUpdate({
        userId,
        entityType: "User",
        recordId: userId,
        oldValues: { mobileNumber: oldMobileNumber },
        newValues: { mobileNumber: newMobileNumber },
        tableName: "users",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        transaction: t,
      });

      return { newRefreshToken: newTokenRecord.refreshToken };
    });

    // Generate new access token
    const newAccessToken = Token.generateAccessToken(userId, userRoleNames[0] || "guest");

    const data = {
      userId,
      mobileNumber: newMobileNumber,
      accessToken: newAccessToken,
      refreshToken: result.newRefreshToken,
    };

    await logRequest(
      req,
      {
        userId,
        status: 200,
        body: { success: true, message: "Mobile number updated successfully" },
        requestBodyLog: { ...requestBodyLog, status: "[SUCCESS]" },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Mobile number updated successfully",
      data
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: userId || null,
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

/**
 * @route   GET /api/v1/auth/available-roles
 * @desc    Fetch status of all client-facing roles for the current user
 * @access  Private
 */
const getAvailableRoles = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const userId = req.user.userId;

  try {
    const roles = await Role.findAll({
      where: {
        roleName: ["Broker", "Investor", "Owner"],
        isActive: true,
      },
      attributes: ["roleId", "roleName"],
      include: [
        {
          model: User,
          as: "users",
          where: { userId },
          through: { attributes: ["assignedAt", "assignedReason"] },
          required: false,
        },
      ],
    });

    // Ensure we return all 3 roles even if user has none of them
    const roleNames = ["Broker", "Investor", "Owner"];
    const formattedRoles = roleNames.map((name) => {
      const dbRole = roles.find((r) => r.roleName === name);
      const userAssigned = dbRole && dbRole.users && dbRole.users.length > 0;
      return {
        roleName: name,
        isAcquired: userAssigned,
        assignedAt: userAssigned ? dbRole.users[0].UserRole.assignedAt : null,
        assignedReason: userAssigned
          ? dbRole.users[0].UserRole.assignedReason
          : null,
      };
    });

    await logRequest(
      req,
      {
        userId,
        status: 200,
        body: {
          success: true,
          message: "Available roles fetched successfully",
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Available roles fetched successfully",
      formattedRoles
    );
  } catch (error) {
    return next(error);
  }
});

// ============================================
// SWITCH ROLE  (POST /api/v1/switch-role)
// ============================================
// Issues a new access token scoped to a role the user ALREADY holds, so the app can
// switch the "active role" without re-login. Does NOT grant new roles.
const switchRole = asyncHandler(async (req, res, next) => {
  try {
    const { roleName } = req.body;
    if (!roleName) {
      throw createAppError("roleName is required", 400);
    }

    // Load the user's active roles.
    const user = await User.findOne({
      where: { userId: req.user.userId, isActive: true },
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          attributes: ["roleName"],
          where: { isActive: true },
          required: false,
        },
      ],
    });

    if (!user) throw createAppError("User not found", 404);

    const heldRoles = (user.roles || []).map((r) => r.roleName);
    if (!heldRoles.includes(roleName)) {
      throw createAppError(
        `You do not have the "${roleName}" role. Available: ${heldRoles.join(", ") || "none"}`,
        403
      );
    }

    // New access token carrying the chosen active role.
    const accessToken = Token.generateAccessToken(req.user.userId, roleName);

    return sendEncodedResponse(res, 200, true, "Role switched successfully", {
      accessToken,
      activeRole: roleName,
      roles: heldRoles,
    });
  } catch (error) {
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
  getClientUsers,
  changeMobileNumber,
  getAvailableRoles,
  switchRole,
};
