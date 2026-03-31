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
  },
  {
    tableName: "property_inquiries",
  }
);

module.exports = PropertyInquiry;
