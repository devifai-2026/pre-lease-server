const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const PropertyCertification = sequelize.define(
  "PropertyCertification",
  {
    propertyId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
    certificationType: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    certificationDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "property_certifications",
    updatedAt: false, // ✅ Override: No updatedAt column
  }
);

module.exports = PropertyCertification;
