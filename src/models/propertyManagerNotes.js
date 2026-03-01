const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyManagerNotes = sequelize.define(
  "PropertyManagerNotes",
  {
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    salesExecutiveId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    totalNotesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.ENUM("pending", "approved"),
      allowNull: false,
      defaultValue: "approved",
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    // Nullable FK — who last edited this record
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

    // ✅ NEW — who created this note
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
      field: "created_by",
    },

    // ✅ NEW — who last updated this note
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
      field: "updated_by",
    },

    // ✅ NEW — whether this note has been edited after creation
    isEdited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_edited",
    },

    // ✅ NEW — the edited version of the note (null if not edited)
    editedNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      field: "edited_note",
    },
  },
  {
    tableName: "property_manager_notes",
    // timestamps: true, // ✅ Inherited from global config
    // underscored: true, // ✅ Inherited from global config
    // freezeTableName: true, // ✅ Inherited from global config
  }
);

// ============================================
// HELPER METHODS (Static Methods)
// ============================================

/**
 * Get the current note text
 * Returns editedNote if the note has been edited, otherwise returns original notes
 * @param {Object} noteRecord - The PropertyManagerNotes instance
 * @returns {string} The effective note text
 */
PropertyManagerNotes.getEffectiveNote = function (noteRecord) {
  return noteRecord.isEdited && noteRecord.editedNote
    ? noteRecord.editedNote
    : noteRecord.notes;
};

/**
 * Mark a note as edited
 * @param {Object} noteRecord - The PropertyManagerNotes instance
 * @param {string} newNoteText - The edited note content
 * @param {string} updatedByUserId - UUID of the user making the edit
 */
PropertyManagerNotes.markAsEdited = function (
  noteRecord,
  newNoteText,
  updatedByUserId
) {
  if (typeof newNoteText !== "string" || !newNoteText.trim()) {
    throw new Error("newNoteText must be a non-empty string");
  }
  noteRecord.editedNote = newNoteText;
  noteRecord.isEdited = true;
  noteRecord.updatedBy = updatedByUserId;
};

module.exports = PropertyManagerNotes;
