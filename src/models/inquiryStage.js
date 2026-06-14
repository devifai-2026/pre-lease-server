const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

// Admin-configurable enquiry pipeline stages (e.g. New, Contacted, Negotiating,
// Closed, Converted, Lost). Inquiries move through these; admins can add, edit,
// reorder and deactivate stages from Advanced Settings.
const InquiryStage = sequelize.define(
  "InquiryStage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    // Sort order in the pipeline (ascending).
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // A terminal stage ends the pipeline (e.g. Converted, Lost) — used by the UI
    // to style it and by reporting to mark a deal done/dead.
    isTerminal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // Points awarded when an enquiry reaches this stage. Required (admin sets it
    // when creating a stage); drives the enquiry score.
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Optional colour for the UI chip (hex).
    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Seeded default stages can't be deleted (only deactivated) to keep the
    // pipeline coherent; admin-created ones can be removed.
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "inquiry_stages",
  }
);

module.exports = InquiryStage;
