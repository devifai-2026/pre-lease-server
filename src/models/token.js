const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");
const jwt = require("jsonwebtoken");

const Token = sequelize.define(
  "Token",
  {
    tokenId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "user_id",
      references: {
        model: "users",
        key: "user_id",
      },
      onDelete: "CASCADE",
    },
    refreshToken: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    issuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    revocationReason: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: "tokens",
    timestamps: false,
  }
);

// Static method: Generate Access Token
Token.generateAccessToken = (userId, roleName) => {
  return jwt.sign(
    {
      _id: userId,
      role: roleName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

// Static method: Generate Refresh Token (JWT)
Token.generateRefreshToken = (userId, roleName) => {
  return jwt.sign(
    {
      _id: userId,
      role: roleName,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// Static method: Verify Access Token
Token.verifyAccessToken = (accessToken) => {
  try {
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    return { valid: true, decoded };
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { valid: false, message: "Access token expired", expired: true };
    }
    if (error.name === "JsonWebTokenError") {
      return { valid: false, message: "Invalid access token" };
    }
    return { valid: false, message: error.message };
  }
};

// Static method: Calculate expiry date from string like '30d', '7d', '24h'
Token.calculateExpiryDate = (expiryString) => {
  const match = expiryString.match(/^(\d+)([dhms])$/);
  if (!match)
    throw new Error(
      "Invalid expiry format. Use format like: 30d, 24h, 60m, 3600s"
    );

  const value = parseInt(match[1]);
  const unit = match[2];

  const now = new Date();
  switch (unit) {
    case "d":
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    case "h":
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case "m":
      return new Date(now.getTime() + value * 60 * 1000);
    case "s":
      return new Date(now.getTime() + value * 1000);
    default:
      throw new Error(
        "Invalid time unit. Use: d (days), h (hours), m (minutes), s (seconds)"
      );
  }
};

// Static method: Verify refresh token from database
Token.verifyRefreshToken = async (refreshToken) => {
  const tokenRecord = await Token.findOne({
    where: {
      refreshToken,
      isActive: true,
    },
  });

  if (!tokenRecord) {
    return { valid: false, message: "Token not found or revoked" };
  }

  if (new Date() > new Date(tokenRecord.expiresAt)) {
    return { valid: false, message: "Token expired" };
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    return { valid: true, token: tokenRecord, decoded };
  } catch (error) {
    return { valid: false, message: "Invalid token signature" };
  }
};

// Static method: Revoke specific token
Token.revokeToken = async (refreshToken, reason = "logout") => {
  const result = await Token.update(
    {
      isActive: false,
      revocationReason: reason,
    },
    {
      where: { refreshToken },
    }
  );

  return result[0] > 0;
};

// Static method: Revoke all tokens for a user
Token.revokeAllUserTokens = async (userId, reason = "logout_all_devices") => {
  const result = await Token.update(
    {
      isActive: false,
      revocationReason: reason,
    },
    {
      where: {
        userId,
        isActive: true,
      },
    }
  );

  return result[0];
};

module.exports = Token;
