const { Op } = require("sequelize");
const { User, UserRole, Token } = require("../models/index");
const {
  isValidEmail,
  isValidPhone,
  validateRequiredFields,
} = require("../utils/validators");
const createAppError = require("../utils/appError");
const { sequelize } = require("../config/dbConnection");

const signup = async (req, res, next) => {
  try {
    const { mobileNumber, email, firstName, lastName, reraNumber, roleName } =
      req.body;

    // Validate required fields
    const requiredFields = ["mobileNumber", "email", "firstName", "lastName"];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      return next(
        createAppError(`Missing required fields: ${missing.join(", ")}`, 400)
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(createAppError("Invalid email format", 400));
    }

    // Validate mobile number (10 digits, starts with 6-9)
    if (!isValidPhone(mobileNumber)) {
      return next(
        createAppError(
          "Invalid mobile number. Must be 10 digits starting with 6-9",
          400
        )
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ mobileNumber }, { email }, { reraNumber }],
      },
      attributes: ["mobileNumber", "email", "reraNumber"],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return next(createAppError("Email already exists", 409));
      } else if (existingUser.mobileNumber === mobileNumber) {
        return next(createAppError("Mobile number already exists", 409));
      } else {
        return next(createAppError("Rera number already exists", 409));
      }
    }

    // Prepare role name
    const role_name = ["investor", "owner"].includes(roleName?.toLowerCase())
      ? roleName.toLowerCase()
      : "broker";

    // Start transaction
    const result = await sequelize.transaction(async (t) => {
      // Create user
      const createUser = await User.create(
        {
          firstName,
          lastName,
          email,
          mobileNumber,
          isActive: true,
          reraNumber: reraNumber || null,
        },
        { transaction: t }
      );

      // Create user role
      const createRole = await UserRole.create(
        {
          userId: createUser.userId,
          roleName: role_name,
        },
        { transaction: t }
      );

      // Create refresh token
      const tokenRecord = await Token.create(
        {
          userId: createUser.userId,
          refreshToken: Token.generateRefreshToken(
            createUser.userId,
            role_name
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
        role: createRole,
        refreshToken: tokenRecord.refreshToken,
      };
    });

    const accessToken = Token.generateAccessToken(
      result.user.userId,
      role_name
    );
    // If we reach here, transaction was successful
    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        userId: result.user.userId,
        role: result.role.roleName,
        accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    // Transaction automatically rolled back on error
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { mobileNumber } = req.body;

    // Validate required fields
    const requiredFields = ["mobileNumber"];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      return next(
        createAppError(`Missing required fields: ${missing.join(", ")}`, 400)
      );
    }

    // Validate mobile number
    if (!isValidPhone(mobileNumber)) {
      return next(
        createAppError(
          "Invalid mobile number. Must be 10 digits starting with 6-9",
          400
        )
      );
    }

    // Check if user exists
    const existingUser = await User.findOne({
      where: { mobileNumber },
      attributes: ["mobileNumber", "userId"],
      include: [
        {
          required: true,
          model: UserRole,
          as: "roles",
          attributes: ["roleName"],
        },
      ],
    });

    if (!existingUser) {
      return next(
        createAppError("Account does not exist, please sign up first", 404)
      );
    }

    // Generate new refresh token
    const refreshToken = Token.generateRefreshToken(
      existingUser.userId,
      existingUser.roles[0].roleName // Fixed: roles is array
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
      existingUser.roles[0].roleName // Fixed: roles is array
    );

    return res.status(200).json({
      success: true,
      message: "Login successfully",
      data: {
        userId: existingUser.userId,
        role: existingUser.roles[0].roleName,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { signup, login };
