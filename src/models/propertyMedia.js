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
      field: "property_id",
      references: {
        model: "properties",
        key: "property_id",
      },
      onDelete: "CASCADE",
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
    freezeTableName: true,
    timestamps: false,
  }
);

module.exports = PropertyMedia;
