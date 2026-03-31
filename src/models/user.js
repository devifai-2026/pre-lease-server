const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const User = sequelize.define(
  "User",
  {
    userId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    mobileNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    reraNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    userType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["client", "admin"]],
      },
    },

    // OTP Authentication
    otp: {
      type: DataTypes.STRING(6),
      allowNull: true,
    },
    otpExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Status
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    joinType: {
      type: DataTypes.ENUM("investor", "broker"),
      allowNull: true, // null for admin users
      field: "join_type",
    },
    isGuest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_guest",
    },
  },
  {
    tableName: "users",
    // timestamps: true,    // ✅ Inherited from global config
    // underscored: true,   // ✅ Inherited from global config
    // freezeTableName: true, // ✅ Inherited from global config
  }
);

module.exports = User;
