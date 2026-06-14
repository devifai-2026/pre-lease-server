const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

// "Contact Us" form submissions from the consumer site. Optionally linked to a
// logged-in user; guests are allowed. Admin-only to read.
const ContactLead = sequelize.define(
  "ContactLead",
  {
    leadId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Self-declared role from the form: investor | property-owner | developer | broker | other
    role: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // open | in_progress | resolved
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "open",
    },
  },
  {
    tableName: "contact_leads",
    timestamps: true,
    underscored: true,
  }
);

module.exports = ContactLead;
