const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/connection');

const Token = sequelize.define(
  'Token',
  {
    tokenId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
      field: 'token_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'user_id',
      },
      onDelete: 'CASCADE',
    },
    refreshToken: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      field: 'refresh_token',
    },
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'device_id',
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent',
    },
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'ip_address',
    },
    issuedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'issued_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    revocationReason: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'revocation_reason',
    },
  },
  {
    tableName: 'tokens',
    freezeTableName: true,
    underscored: true,
    timestamps: false,
  }
);

// Association with User model
Token.associate = models => {
  Token.belongsTo(models.User, {
    foreignKey: 'userId',
    targetKey: 'userId',
    as: 'user',
  });
};

module.exports = Token;
