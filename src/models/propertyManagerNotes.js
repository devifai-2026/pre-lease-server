const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyManagerNotes = sequelize.define(
  "PropertyManagerNotes",
  {
    noteId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },

    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // FK to the user who created this note (sales exec, admin, or owner)
    salesExecutiveId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("pending", "approved", "denied"),
      allowNull: false,
      defaultValue: "approved",
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    // Nullable FK — who edited this record (admin only)
    editedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },

    // Nullable FK — who approved this record
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },

    // Who created this note
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },

    // Who last updated this note
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },

    // Whether this note has been edited by admin after creation
    isEdited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // The admin-edited version of the note (null if not edited)
    editedNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "property_manager_notes",
  }
);

// ============================================
// HELPER METHODS (Static Methods)
// ============================================

/**
 * Get the current note text
 * Returns editedNote if the note has been edited, otherwise returns original notes
 */
PropertyManagerNotes.getEffectiveNote = function (noteRecord) {
  return noteRecord.isEdited && noteRecord.editedNote
    ? noteRecord.editedNote
    : noteRecord.notes;
};

module.exports = PropertyManagerNotes;
