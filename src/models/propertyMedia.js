const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyMedia = sequelize.define(
  "PropertyMedia",
  {
    mediaId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      // Foreign key managed by association in index.js
    },
    mediaType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [["photo", "video"]],
      },
    },
    fileUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    uploadedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "property_media",
    timestamps: false, // ✅ Override: No timestamps (has uploadedAt)
  }
);

module.exports = PropertyMedia;
