const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");
const { v4: uuidv4 } = require("uuid");

const PropertyInvestorNote = sequelize.define(
  "PropertyInvestorNote",
  {
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    investorId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    notes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidNotesArray(value) {
          if (!Array.isArray(value)) {
            throw new Error("notes must be an array");
          }
        },
      },
    },
    totalNotesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "property_investor_notes",
    // timestamps: true,    // ✅ Inherited from global config
    // underscored: true,   // ✅ Inherited from global config
    // freezeTableName: true, // ✅ Inherited from global config
  }
);

// ============================================
// HELPER METHODS (Static Methods)
// ============================================

/**
 * Add/Push new notes to existing array
 * @param {Object} noteRecord - The PropertyInvestorNote instance
 * @param {Array} newNotesArray - Array of new notes to push [{note: "...", createdAt: "..."}, ...]
 * @returns {Array} The newly added notes
 */
PropertyInvestorNote.pushNotes = function (noteRecord, newNotesArray) {
  if (!Array.isArray(newNotesArray)) {
    throw new Error("newNotesArray must be an array");
  }

  // Add to existing notes array
  noteRecord.notes = [...noteRecord.notes, ...newNotesArray];
  noteRecord.totalNotesCount = noteRecord.notes.length;
  noteRecord.changed("notes", true);

  return newNotesArray;
};

/**
 * Get all notes sorted by latest first
 * @param {Object} noteRecord - The PropertyInvestorNote instance
 * @returns {Array} Array of note objects
 */
PropertyInvestorNote.getAllNotes = function (noteRecord) {
  return noteRecord.notes.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

module.exports = PropertyInvestorNote;
