const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

// Two-way conversation on an enquiry between the assigned Client Dealer and the
// inquirer (broker/investor). Dealer messages are admin-approved before the
// broker sees them (mirrors the property-notes approval flow); broker replies
// are shown directly to the dealer.
const InquiryMessage = sequelize.define(
  "InquiryMessage",
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
    // Who wrote it.
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // 'dealer' (needs approval) or 'broker' (the inquirer; shown directly).
    senderType: {
      type: DataTypes.ENUM("dealer", "broker"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // pending → awaiting admin approval (dealer messages start here)
    // approved → visible to the broker
    // denied  → rejected by admin
    status: {
      type: DataTypes.ENUM("pending", "approved", "denied"),
      allowNull: false,
      defaultValue: "approved",
    },
    // Admin may edit the dealer's text before approving — stored here.
    editedMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    declineReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "inquiry_messages",
  }
);

module.exports = InquiryMessage;
