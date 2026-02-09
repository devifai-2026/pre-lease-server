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
      allowNull: true,
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
      validate: {
        isIn: {
          args: [["Residential", "Retail", "Offices", "Industrial", "Others"]],
          msg: "Invalid property type. Must be one of: Residential, Retail, Offices, Industrial, Others",
        },
      },
    },
    carpetArea: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    carpetAreaUnit: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "Sq. Feet",
      validate: {
        isIn: {
          args: [["Sq. Feet", "Sq. Meters"]],
          msg: "Invalid carpet area unit. Must be 'Sq. Feet' or 'Sq. Meters'",
        },
      },
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
      validate: {
        isIn: {
          args: [["A+", "A", "B+", "B", "C"]],
          msg: "Invalid building grade. Must be one of: A+, A, B+, B, C",
        },
      },
    },
    ownershipType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Freehold", "Leasehold", "Jointly-hold", "Government Owned"]],
          msg: "Invalid ownership type. Must be one of: Freehold, Leasehold, Jointly-hold, Government Owned",
        },
      },
    },

    // Parking
    parkingTwoWheeler: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    parkingFourWheeler: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    // Infrastructure
    powerBackup: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Yes", "No"]],
          msg: "Invalid power backup value. Must be 'Yes' or 'No'",
        },
      },
    },
    numberOfLifts: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    hvacType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Central AC", "Split AC", "VRF System"]],
          msg: "Invalid HVAC type. Must be one of: Central AC, Split AC, VRF System",
        },
      },
    },
    furnishingStatus: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        isIn: {
          args: [
            [
              "Fully Furnished by landowner",
              "Semi-Furnished by landowner",
              "Not Furnished by landowner",
            ],
          ],
          msg: "Invalid furnishing status",
        },
      },
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
      validate: {
        isIn: {
          args: [["No Litigation", "Pending Litigation"]],
          msg: "Invalid title status. Must be 'No Litigation' or 'Pending Litigation'",
        },
      },
    },
    occupancyCertificate: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Yes, available", "In Process", "Not available"]],
          msg: "Invalid occupancy certificate status",
        },
      },
    },
    leaseRegistration: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Registered Lease", "Notorized Lease", "No lease document"]],
          msg: "Invalid lease registration status",
        },
      },
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
      validate: {
        isIn: {
          args: [["Government", "Startup", "MNC", "Corporate", "Others"]],
          msg: "Invalid tenant type. Must be one of: Government, Startup, MNC, Corporate, Others",
        },
      },
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
      validate: {
        isIn: {
          args: [["Per Sq Ft", "Lump Sum"]],
          msg: "Invalid rent type. Must be 'Per Sq Ft' or 'Lump Sum'",
        },
      },
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
      validate: {
        isIn: {
          args: [["Months of Rent", "Lump Sum"]],
          msg: "Invalid security deposit type. Must be 'Months of Rent' or 'Lump Sum'",
        },
      },
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
      validate: {
        isIn: {
          args: [["Yes, included in rent", "No, excluded from rent"]],
          msg: "Invalid maintenance costs option",
        },
      },
    },
    maintenanceType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: {
          args: [["Per Sq Ft", "Lump Sum"]],
          msg: "Invalid maintenance type. Must be 'Per Sq Ft' or 'Lump Sum'",
        },
      },
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
