const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

// Timeline of an enquiry's stage transitions. Each entry records the stage the
// inquiry moved to, an optional note, and who changed it / when — giving sales
// a full audit trail per enquiry.
const InquiryStatusHistory = sequelize.define(
  "InquiryStatusHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    inquiryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    stageId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // Snapshot of the stage name at the time of change (so history stays
    // readable even if a stage is later renamed/deleted).
    stageName: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    changedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: "inquiry_status_history",
    updatedAt: false,
  }
);

module.exports = InquiryStatusHistory;
