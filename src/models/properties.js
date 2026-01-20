const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/dbConnection");

const Property = sequelize.define(
  "Property",
  {
    propertyId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "owner_id",
      references: {
        model: "users",
        key: "user_id",
      },
      onDelete: "CASCADE",
    },
    // Basic Details
    propertyType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    carpetAreaSqft: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    lastRefurbished: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    ownershipType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    buildingGrade: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Parking
    parkingSlots: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    parkingRatio: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // Infrastructure
    powerBackupKva: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    numberOfLifts: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    hvacType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    furnishingStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    buildingMaintainedBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Legal Details
    titleStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    occupancyCertificate: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    leaseRegistration: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    hasPendingLitigation: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,
    },
    litigationDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reraNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // Location
    microMarket: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // Market Intelligence
    demandDrivers: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    upcomingDevelopments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Property Description
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    otherAmenities: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Metadata
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "properties",
    freezeTableName: true,
    timestamps: true,
  }
);

module.exports = Property;
