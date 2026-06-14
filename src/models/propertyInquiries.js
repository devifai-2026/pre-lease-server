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
    inquiry: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "urgent"),
      defaultValue: "medium",
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
    inquirerRoleType: {
      type: DataTypes.ENUM("investor", "broker"),
      allowNull: true,
      defaultValue: "investor",
      field: "inquirer_role_type",
    },
    // Current pipeline stage (FK -> inquiry_stages). Null until first set;
    // defaults to the first stage on assignment/seed.
    stageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "stage_id",
    },
    // When the assigned dealer last opened this enquiry's message thread.
    // Used to badge enquiries that have newer client (broker/investor)
    // messages the dealer hasn't seen yet. Null = never opened.
    dealerLastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "property_inquiries",
  }
);

module.exports = PropertyInquiry;
