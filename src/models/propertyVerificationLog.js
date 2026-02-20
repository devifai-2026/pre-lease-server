const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyVerificationLog = sequelize.define(
  "PropertyVerificationLog",

  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      // Foreign key managed by association in index.js
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      // Foreign key managed by association in index.js
    },

    // ========== STATUS ==========
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending", // ← add this
      validate: {
        isIn: {
          args: [["pending", "verified"]],
          msg: "Invalid status. Must be one of: pending, verified",
        },
      },
    },
  },

  {
    tableName: "property_verification_logs",
    // timestamps: true,       // ✅ Inherited from global config
    // underscored: true,      // ✅ Inherited from global config
    // freezeTableName: true,  // ✅ Inherited from global config
  }
);

module.exports = PropertyVerificationLog;
