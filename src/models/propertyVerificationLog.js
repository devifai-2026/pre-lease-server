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

    // ========== ROLE AT TIME OF VERIFICATION ==========
    // Stores the verifier's role so we can enforce the
    // "two different roles" rule for completed status.
    roleAtVerification: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    // ========== STATUS ==========
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "verified",
      validate: {
        isIn: {
          args: [["verified"]],
          msg: "Invalid status. Must be: verified",
        },
      },
    },
  },

  {
    tableName: "property_verification_logs",
    // timestamps: true,       // ✅ Inherited from global config
    // underscored: true,      // ✅ Inherited from global config
    // freezeTableName: true,  // ✅ Inherited from global config
    indexes: [
      {
        // ✅ Enforces: one person can verify a property only once
        unique: true,
        fields: ["property_id", "user_id"],
        name: "unique_property_user_verification",
      },
    ],
  }
);

module.exports = PropertyVerificationLog;

