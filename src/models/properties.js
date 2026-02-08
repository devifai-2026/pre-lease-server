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
      // Foreign key managed by association in index.js
    },
    brokerId: {
      type: DataTypes.UUID,
      allowNull: true,
      // Foreign key managed by association in index.js
    },

    // ========== BASIC PROPERTY DETAILS ==========
    propertyType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    carpetArea: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    carpetAreaUnit: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "Sq. Feet",
    },
    completionYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lastRefurbishedYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    buildingGrade: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    ownershipType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    // Parking
    parking4wheeler: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    parking2wheeler: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    // Infrastructure
    powerBackup: {
      type: DataTypes.STRING(20),
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
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    maintainedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // Foreign key managed by association in index.js
    },

    // Description
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    additionalDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ========== LEGAL & TITLE DETAILS ==========
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

    // ========== LEASE & TENANT DETAILS ==========
    tenantType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    leaseStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    leaseEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    lockInPeriodYears: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lockInPeriodMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    leaseDurationYears: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    // Rental Details
    rentType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "Per Sq Ft",
    },
    rentPerSqftMonthly: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    totalMonthlyRent: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    // Security Deposit
    securityDepositType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "Months of Rent",
    },
    securityDepositMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    securityDepositAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    // Escalation & Maintenance
    escalationFrequencyYears: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    annualEscalationPercent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    maintenanceCostsIncluded: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    maintenanceType: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    maintenanceAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    // ========== LOCATION ==========
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

    // ========== MARKET INTELLIGENCE ==========
    demandDrivers: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    upcomingDevelopments: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ========== FINANCIAL ANALYTICS ==========
    sellingPrice: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    propertyTaxAnnual: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    insuranceAnnual: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    otherCostsAnnual: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    totalOperatingAnnualCosts: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    additionalIncomeAnnual: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    // Calculated Metrics
    annualGrossRent: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    grossRentalYield: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    netRentalYield: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    paybackPeriodYears: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },

    // ========== METADATA ==========
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "properties",
    // timestamps: true,    // ✅ Inherited from global config
    // underscored: true,   // ✅ Inherited from global config
    // freezeTableName: true, // ✅ Inherited from global config
  }
);

module.exports = Property;
