const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyInquiry = sequelize.define(
  "PropertyInquiry",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inquirerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inquiries: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidInquiriesArray(value) {
          if (!Array.isArray(value)) {
            throw new Error("inquiries must be an array");
          }
        },
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: {
          args: [
            [
              "pending",
              "assigned",
              "in_progress",
              "contacted",
              "follow_up_scheduled",
              "converted",
              "closed",
            ],
          ],
          msg: `Invalid property type. Must be one of:         "pending",
        "assigned",
        "in_progress",
        "contacted",
        "follow_up_scheduled",
        "converted",
        "closed"`,
        },
      },

      defaultValue: "pending",
    },
    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "urgent"),
    },
    assignedTo: {
      type: DataTypes.UUID,
    },
    assignedBy: {
      type: DataTypes.UUID,
    },
    assignedAt: {
      type: DataTypes.DATE,
      field: "assigned_at",
    },
    source: {
      type: DataTypes.STRING(50),
    },
  },
  {
    tableName: "property_inquiries",
    // timestamps: true,    // ✅ Inherited from global config
    // underscored: true,   // ✅ Inherited from global config
    // freezeTableName: true, // ✅ Inherited from global config
  }
);

// ============================================
// HELPER METHODS (Static Methods)
// ============================================

/**
 * Add/Push new inquiries to existing array
 * @param {Object} inquiryRecord - The PropertyInquiry instance
 * @param {Array} newInquiriesArray - Array of new inquiries to push [{question: "...", createdAt: "..."}, ...]
 * @returns {Array} The newly added inquiries
 */
PropertyInquiry.pushInquiries = function (inquiryRecord, newInquiriesArray) {
  if (!Array.isArray(newInquiriesArray)) {
    throw new Error("newInquiriesArray must be an array");
  }

  // Add to existing inquiries array
  inquiryRecord.inquiries = [...inquiryRecord.inquiries, ...newInquiriesArray];
  inquiryRecord.changed("inquiries", true);

  return newInquiriesArray;
};

/**
 * Get all inquiries sorted by latest first
 * @param {Object} inquiryRecord - The PropertyInquiry instance
 * @returns {Array} Array of inquiry objects
 */
PropertyInquiry.getAllInquiries = function (inquiryRecord) {
  return inquiryRecord.inquiries.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

module.exports = PropertyInquiry;
