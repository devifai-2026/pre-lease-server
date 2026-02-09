const {
  Property,
  PropertyMedia,
  Amenity,
  Caretaker,
  User,
  Role,
} = require("../models"); // ✅ Removed AuditLog (using utility instead)
const { sequelize } = require("../config/dbConnection");
const createAppError = require("../utils/appError");
const { validateRequiredFields } = require("../utils/validators");
const asyncHandler = require("../utils/asyncHandler");
const {
  logRequest,
  logInsert,
  logUpdate,
  buildUpdateValues,
} = require("../utils/logs");

// ============================================
// CREATE PROPERTY
// ============================================
const createProperty = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const {
    // Basic Details
    propertyType,
    carpetAreaSqft,
    lastRefurbished,
    ownershipType,
    buildingGrade,

    // Parking
    parkingSlots,
    parkingRatio,

    // Infrastructure
    powerBackupKva,
    numberOfLifts,
    hvacType,
    furnishingStatus,
    buildingMaintainedBy,

    // Legal Details
    titleStatus,
    occupancyCertificate,
    leaseRegistration,
    hasPendingLitigation,
    litigationDetails,
    reraNumber,

    // Location
    microMarket,
    city,
    state,

    // Market Intelligence
    demandDrivers,
    upcomingDevelopments,

    // Property Description
    description,
    otherAmenities,

    // Amenities & Caretaker
    amenityIds,
    caretakerId,
  } = req.body;

  // Prepare log-safe request body
  const requestBodyLog = {
    propertyType,
    carpetAreaSqft,
    city,
    state,
    ownershipType,
    userRole: req.userRole,
    hasMedia: req.files && req.files.length > 0,
    mediaCount: req.files ? req.files.length : 0,
    amenityCount: amenityIds ? amenityIds.length : 0,
    caretakerId: caretakerId || null,
  };

  return (async () => {
    try {
      // Validate required fields
      const requiredFields = ["city", "state"];
      const missing = validateRequiredFields(requiredFields, req.body);
      if (missing.length > 0) {
        throw createAppError(
          `Missing required fields: ${missing.join(", ")}`,
          400
        );
      }

      // Verify user exists and get role info
      const userWithRole = await User.findOne({
        where: { userId: req.user.userId, isActive: true },
        include: [
          {
            model: Role,
            as: "roles",
            through: { attributes: [] },
            attributes: ["roleId", "roleName"],
            where: { isActive: true },
          },
        ],
      });

      if (!userWithRole) {
        throw createAppError("User not found or inactive", 404);
      }

      const userRole = userWithRole.roles[0].roleName;

      // Validate caretaker exists if provided
      if (caretakerId) {
        const caretaker = await Caretaker.findOne({
          where: { caretakerId, isActive: true },
        });
        if (!caretaker) {
          throw createAppError("Invalid caretaker ID", 400);
        }
      }

      // Validate amenities exist if provided
      if (amenityIds && amenityIds.length > 0) {
        const validAmenities = await Amenity.findAll({
          where: { amenityId: amenityIds, isActive: true },
          attributes: ["amenityId"],
        });

        if (validAmenities.length !== amenityIds.length) {
          throw createAppError("One or more invalid amenity IDs provided", 400);
        }
      }

      // Start transaction
      const result = await sequelize.transaction(async (t) => {
        // Create property data
        const propertyData = {
          // Basic Details
          propertyType: propertyType || null,
          carpetAreaSqft: carpetAreaSqft || null,
          lastRefurbished: lastRefurbished || null,
          ownershipType: ownershipType || null,
          buildingGrade: buildingGrade || null,

          // Parking
          parkingFourWheeler: parkingSlots || null,
          parkingTworWheeler: parkingRatio || null,

          // Infrastructure
          powerBackupKva: powerBackupKva || null,
          numberOfLifts: numberOfLifts || null,
          hvacType: hvacType || null,
          furnishingStatus: furnishingStatus || null,
          buildingMaintainedBy: buildingMaintainedBy || null,

          // Legal Details
          titleStatus: titleStatus || null,
          occupancyCertificate: occupancyCertificate || null,
          leaseRegistration: leaseRegistration || null,
          hasPendingLitigation:
            hasPendingLitigation !== undefined ? hasPendingLitigation : false,
          litigationDetails: litigationDetails || null,
          reraNumber: reraNumber || null,

          // Location
          microMarket: microMarket || null,
          city,
          state,

          // Market Intelligence
          demandDrivers: demandDrivers || null,
          upcomingDevelopments: upcomingDevelopments || null,

          // Property Description
          description: description || null,
          otherAmenities: otherAmenities || null,

          // Caretaker
          caretakerId: caretakerId || null,

          // Metadata
          isActive: true,
        };

        // Set ownerId or brokerId based on user's role
        if (userRole === "Owner") {
          propertyData.ownerId = req.user.userId;
          propertyData.brokerId = null;
        } else if (userRole === "Broker") {
          propertyData.brokerId = req.user.userId;
          propertyData.ownerId = null;
        }

        const property = await Property.create(propertyData, {
          transaction: t,
        });

        // Associate amenities with property
        if (amenityIds && amenityIds.length > 0) {
          await property.setAmenities(amenityIds, { transaction: t });
        }

        // Upload media files if provided
        let mediaRecords = [];
        if (req.files && req.files.length > 0) {
          mediaRecords = await Promise.all(
            req.files.map((file) => {
              const mediaType = file.mimetype.startsWith("video/")
                ? "video"
                : "photo";

              return PropertyMedia.create(
                {
                  propertyId: property.propertyId,
                  mediaType,
                  fileUrl: file.location || file.path,
                },
                { transaction: t }
              );
            })
          );
        }

        // ✅ CREATE AUDIT LOG - Using utility function
        await logInsert({
          userId: req.user.userId,
          entityType: "Property",
          recordId: property.propertyId,
          newRecord: {
            // Property details
            propertyId: property.propertyId,
            city: property.city,
            state: property.state,
            propertyType: property.propertyType,
            carpetAreaSqft: property.carpetAreaSqft,
            ownershipType: property.ownershipType,
            buildingGrade: property.buildingGrade,
            parkingSlots: property.parkingSlots,
            parkingRatio: property.parkingRatio,
            powerBackupKva: property.powerBackupKva,
            numberOfLifts: property.numberOfLifts,
            hvacType: property.hvacType,
            furnishingStatus: property.furnishingStatus,

            // Ownership
            ownerId: property.ownerId,
            brokerId: property.brokerId,
            caretakerId: property.caretakerId,

            // Metadata
            createdBy: userRole,
            amenityCount: amenityIds ? amenityIds.length : 0,
            mediaCount: mediaRecords.length,
          },
          tableName: "properties",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });

        return {
          property,
          media: mediaRecords,
          amenityCount: amenityIds ? amenityIds.length : 0,
          createdByRole: userRole,
        };
      });

      const responseData = {
        success: true,
        message: "Property created successfully",
        data: {
          propertyId: result.property.propertyId,
          city: result.property.city,
          state: result.property.state,
          propertyType: result.property.propertyType,
          createdBy: result.createdByRole,
          ownerId: result.property.ownerId,
          brokerId: result.property.brokerId,
          caretakerId: result.property.caretakerId,
          amenityCount: result.amenityCount,
          mediaCount: result.media.length,
        },
      };

      // Log successful API request
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 201,
          body: { success: true, message: "Property created successfully" },
          requestBodyLog: {
            ...requestBodyLog,
            propertyId: result.property.propertyId,
            createdByRole: result.createdByRole,
          },
        },
        requestStartTime,
        next
      );

      return res.status(201).json(responseData);
    } catch (error) {
      // Log failed API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// UPDATE PROPERTY
// ============================================
const updateProperty = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;

  const requestBodyLog = {
    propertyId,
    userRole: req.userRole,
    updatedFields: Object.keys(req.body).filter(
      (key) =>
        key !== "ownerId" &&
        key !== "propertyId" &&
        key !== "brokerId" &&
        key !== "amenityIds"
    ),
    hasNewMedia: req.files && req.files.length > 0,
    newMediaCount: req.files ? req.files.length : 0,
    amenityUpdate: req.body.amenityIds ? true : false,
  };

  return (async () => {
    try {
      const userRole = req.userRole;

      let whereCondition = {
        propertyId,
        isActive: true,
      };

      if (userRole === "Owner") {
        whereCondition.ownerId = req.user.userId;
      } else if (userRole === "Broker") {
        whereCondition.brokerId = req.user.userId;
      }

      const existingProperty = await Property.findOne({
        where: whereCondition,
      });

      if (!existingProperty) {
        throw createAppError(
          "Property not found or you don't have permission to update it",
          404
        );
      }

      // ✅ Store old values BEFORE update (for audit log)
      const oldRecord = existingProperty.toJSON();

      // Extract amenityIds and caretakerId separately
      const {
        ownerId,
        brokerId,
        propertyId: propId,
        amenityIds,
        caretakerId,
        ...updateData
      } = req.body;

      // Add caretakerId to updateData if provided
      if (caretakerId !== undefined) {
        if (caretakerId !== null) {
          const caretaker = await Caretaker.findOne({
            where: { caretakerId, isActive: true },
          });
          if (!caretaker) {
            throw createAppError("Invalid caretaker ID", 400);
          }
        }
        updateData.caretakerId = caretakerId;
      }

      // Validate amenities if provided
      if (amenityIds && amenityIds.length > 0) {
        const validAmenities = await Amenity.findAll({
          where: { amenityId: amenityIds, isActive: true },
          attributes: ["amenityId"],
        });

        if (validAmenities.length !== amenityIds.length) {
          throw createAppError("One or more invalid amenity IDs provided", 400);
        }
      }

      if (ownerId || propId || brokerId) {
        console.warn(
          `Attempt to update protected fields by user ${req.user.userId} (role: ${userRole})`
        );
      }

      if (
        Object.keys(updateData).length === 0 &&
        (!req.files || req.files.length === 0) &&
        !amenityIds
      ) {
        throw createAppError("No fields to update", 400);
      }

      // Start transaction
      const result = await sequelize.transaction(async (t) => {
        // Update property fields
        if (Object.keys(updateData).length > 0) {
          await existingProperty.update(updateData, { transaction: t });
        }

        // Update amenities if provided
        let oldAmenityIds = [];
        if (amenityIds) {
          // ✅ Get old amenity IDs BEFORE updating
          const oldAmenities = await existingProperty.getAmenities({
            attributes: ["amenityId"],
            raw: true,
            transaction: t,
          });
          oldAmenityIds = oldAmenities.map((a) => a.amenityId);

          // Update amenities
          await existingProperty.setAmenities(amenityIds, { transaction: t });
        }

        // Upload new media files
        let newMediaRecords = [];
        if (req.files && req.files.length > 0) {
          newMediaRecords = await Promise.all(
            req.files.map((file) => {
              const mediaType = file.mimetype.startsWith("video/")
                ? "video"
                : "photo";

              return PropertyMedia.create(
                {
                  propertyId,
                  mediaType,
                  fileUrl: file.location || file.path,
                },
                { transaction: t }
              );
            })
          );
        }

        // ✅ BUILD OLD/NEW VALUES using utility function
        const { oldValues, newValues } = buildUpdateValues(
          oldRecord,
          updateData
        );

        // ✅ Add amenity changes to old/new values
        if (amenityIds) {
          oldValues.amenityIds = oldAmenityIds;
          newValues.amenityIds = amenityIds;
        }

        // ✅ Add media additions to new values
        if (newMediaRecords.length > 0) {
          newValues.mediaAdded = newMediaRecords.length;
        }

        // ✅ Add metadata to new values
        newValues.updatedBy = userRole;

        // ✅ CREATE AUDIT LOG - Using utility function
        await logUpdate({
          userId: req.user.userId,
          entityType: "Property",
          recordId: propertyId,
          oldValues, // ✅ Only changed fields (before)
          newValues, // ✅ Only changed fields (after)
          tableName: "properties",
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          transaction: t,
        });

        return {
          property: existingProperty,
          updatedFields: Object.keys(updateData),
          newMedia: newMediaRecords,
          amenitiesUpdated: amenityIds ? true : false,
        };
      });

      const responseData = {
        success: true,
        message: "Property updated successfully",
        data: {
          propertyId: result.property.propertyId,
          updatedBy: userRole,
          updatedFields: result.updatedFields,
          newMediaCount: result.newMedia.length,
          amenitiesUpdated: result.amenitiesUpdated,
        },
      };

      // Log successful API request
      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: 200,
          body: { success: true, message: "Property updated successfully" },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return res.status(200).json(responseData);
    } catch (error) {
      // Log failed API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// GET ALL AMENITIES
// ============================================
const getAllAmenities = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const requestBodyLog = {
    userId: req.user?.userId || null,
    endpoint: "/api/amenities",
  };

  return (async () => {
    try {
      // Fetch only active amenities with minimal fields for dropdown
      const amenities = await Amenity.findAll({
        where: { isActive: true },
        attributes: ["amenityId", "amenityName"],
        order: [["amenityName", "ASC"]],
        raw: true,
      });

      const responseData = {
        success: true,
        message: "Amenities fetched successfully",
        data: amenities,
        count: amenities.length,
      };

      // Log successful API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: 200,
          body: {
            success: true,
            message: "Amenities fetched successfully",
            count: amenities.length,
          },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return res.status(200).json(responseData);
    } catch (error) {
      // Log failed API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// GET ALL CARETAKERS
// ============================================
const getAllCaretakers = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const requestBodyLog = {
    userId: req.user?.userId || null,
    endpoint: "/api/caretakers",
  };

  return (async () => {
    try {
      // Fetch only active caretakers with minimal fields for dropdown
      const caretakers = await Caretaker.findAll({
        where: { isActive: true },
        attributes: ["caretakerId", "caretakerName"],
        order: [["caretakerName", "ASC"]],
        raw: true,
      });

      const responseData = {
        success: true,
        message: "Caretakers fetched successfully",
        data: caretakers,
        count: caretakers.length,
      };

      // Log successful API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: 200,
          body: {
            success: true,
            message: "Caretakers fetched successfully",
            count: caretakers.length,
          },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return res.status(200).json(responseData);
    } catch (error) {
      // Log failed API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

// ============================================
// COMPARE PROPERTIES (PUBLIC - NO AUTH)
// ============================================
const compareProperties = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const { propertyIds } = req.query; // ?propertyIds=id1,id2,id3

  const requestBodyLog = {
    endpoint: "/api/properties/compare",
    propertyIds: propertyIds || null,
    isPublic: true,
  };

  return (async () => {
    try {
      // Validate propertyIds parameter
      if (!propertyIds) {
        throw createAppError(
          "propertyIds query parameter is required (comma-separated UUIDs)",
          400
        );
      }

      // Parse and validate property IDs
      const propertyIdArray = propertyIds.split(",").map((id) => id.trim());

      // Validate: must have 2-3 properties
      if (propertyIdArray.length < 2) {
        throw createAppError(
          "At least 2 property IDs are required for comparison",
          400
        );
      }

      if (propertyIdArray.length > 3) {
        throw createAppError(
          "Maximum 3 properties can be compared at once",
          400
        );
      }

      // Validate UUID format (basic check)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidIds = propertyIdArray.filter((id) => !uuidRegex.test(id));

      if (invalidIds.length > 0) {
        throw createAppError(
          `Invalid UUID format for property IDs: ${invalidIds.join(", ")}`,
          400
        );
      }

      // Fetch properties with related data
      const properties = await Property.findAll({
        where: {
          propertyId: propertyIdArray,
          isActive: true,
        },
        attributes: [
          // Basic Info
          "propertyId",
          "propertyType",
          "carpetArea",
          "carpetAreaUnit",
          "completionYear",
          "lastRefurbishedYear",
          "buildingGrade",
          "ownershipType",

          // Parking
          "parkingTwoWheeler",
          "parkingFourWheeler",

          // Infrastructure
          "powerBackup",
          "numberOfLifts",
          "hvacType",
          "furnishingStatus",

          // Legal
          "titleStatus",
          "occupancyCertificate",
          "leaseRegistration",
          "hasPendingLitigation",
          "reraNumber",

          // Lease Details
          "tenantType",
          "leaseStartDate",
          "leaseEndDate",
          "lockInPeriodYears",
          "lockInPeriodMonths",
          "leaseDurationYears",

          // Rental
          "rentType",
          "rentPerSqftMonthly",
          "totalMonthlyRent",
          "securityDepositType",
          "securityDepositMonths",
          "securityDepositAmount",

          // Escalation & Maintenance
          "escalationFrequencyYears",
          "annualEscalationPercent",
          "maintenanceCostsIncluded",
          "maintenanceType",
          "maintenanceAmount",

          // Location
          "microMarket",
          "city",
          "state",

          // Financial
          "sellingPrice",
          "propertyTaxAnnual",
          "insuranceAnnual",
          "otherCostsAnnual",
          "totalOperatingAnnualCosts",
          "additionalIncomeAnnual",
          "annualGrossRent",
          "grossRentalYield",
          "netRentalYield",
          "paybackPeriodYears",

          // Description
          "description",
          "additionalDescription",
        ],
        include: [
          {
            model: Amenity,
            as: "amenities",
            attributes: ["amenityId", "amenityName"],
            through: { attributes: [] },
            where: { isActive: true },
            required: false,
          },
          {
            model: PropertyMedia,
            as: "media",
            attributes: ["mediaId", "mediaType", "fileUrl"],
            required: false,
            limit: 5, // Limit to first 5 images per property
          },
          {
            model: Caretaker,
            as: "caretaker",
            attributes: ["caretakerId", "caretakerName"],
            where: { isActive: true },
            required: false,
          },
        ],
        order: [
          // Maintain the order of input IDs
          [
            sequelize.literal(
              `CASE ${propertyIdArray
                .map(
                  (id, index) =>
                    `WHEN "Property"."property_id" = '${id}' THEN ${index}`
                )
                .join(" ")} END`
            ),
          ],
        ],
      });

      // Check if all requested properties were found
      if (properties.length === 0) {
        throw createAppError(
          "No active properties found with provided IDs",
          404
        );
      }

      if (properties.length < propertyIdArray.length) {
        const foundIds = properties.map((p) => p.propertyId);
        const notFoundIds = propertyIdArray.filter(
          (id) => !foundIds.includes(id)
        );

        // Log warning but continue with found properties
        console.warn(
          `Some properties not found or inactive: ${notFoundIds.join(", ")}`
        );
      }

      // Build comparison response
      const comparison = {
        propertiesCompared: properties.length,
        properties: properties.map((property) => ({
          propertyId: property.propertyId,
          basicInfo: {
            propertyType: property.propertyType,
            carpetArea: property.carpetArea,
            carpetAreaUnit: property.carpetAreaUnit,
            completionYear: property.completionYear,
            lastRefurbishedYear: property.lastRefurbishedYear,
            buildingGrade: property.buildingGrade,
            ownershipType: property.ownershipType,
          },
          location: {
            microMarket: property.microMarket,
            city: property.city,
            state: property.state,
          },
          parking: {
            twoWheeler: property.parkingTwoWheeler,
            fourWheeler: property.parkingFourWheeler,
          },
          infrastructure: {
            powerBackup: property.powerBackup,
            numberOfLifts: property.numberOfLifts,
            hvacType: property.hvacType,
            furnishingStatus: property.furnishingStatus,
          },
          legal: {
            titleStatus: property.titleStatus,
            occupancyCertificate: property.occupancyCertificate,
            leaseRegistration: property.leaseRegistration,
            hasPendingLitigation: property.hasPendingLitigation,
            reraNumber: property.reraNumber,
          },
          leaseDetails: {
            tenantType: property.tenantType,
            leaseStartDate: property.leaseStartDate,
            leaseEndDate: property.leaseEndDate,
            lockInPeriod: {
              years: property.lockInPeriodYears,
              months: property.lockInPeriodMonths,
            },
            leaseDurationYears: property.leaseDurationYears,
          },
          rental: {
            rentType: property.rentType,
            rentPerSqftMonthly: property.rentPerSqftMonthly,
            totalMonthlyRent: property.totalMonthlyRent,
            securityDeposit: {
              type: property.securityDepositType,
              months: property.securityDepositMonths,
              amount: property.securityDepositAmount,
            },
          },
          escalationAndMaintenance: {
            escalationFrequencyYears: property.escalationFrequencyYears,
            annualEscalationPercent: property.annualEscalationPercent,
            maintenanceCostsIncluded: property.maintenanceCostsIncluded,
            maintenanceType: property.maintenanceType,
            maintenanceAmount: property.maintenanceAmount,
          },
          financial: {
            sellingPrice: property.sellingPrice,
            propertyTaxAnnual: property.propertyTaxAnnual,
            insuranceAnnual: property.insuranceAnnual,
            otherCostsAnnual: property.otherCostsAnnual,
            totalOperatingAnnualCosts: property.totalOperatingAnnualCosts,
            additionalIncomeAnnual: property.additionalIncomeAnnual,
            annualGrossRent: property.annualGrossRent,
            grossRentalYield: property.grossRentalYield,
            netRentalYield: property.netRentalYield,
            paybackPeriodYears: property.paybackPeriodYears,
          },
          amenities: property.amenities || [],
          media: property.media || [],
          caretaker: property.caretaker || null,
          description: property.description,
          additionalDescription: property.additionalDescription,
        })),
      };

      const responseData = {
        success: true,
        message: "Properties comparison fetched successfully",
        data: comparison,
      };

      // Log successful API request
      await logRequest(
        req,
        {
          userId: null, // Public API - no user
          status: 200,
          body: {
            success: true,
            message: "Properties comparison fetched successfully",
            propertiesFound: properties.length,
          },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return res.status(200).json(responseData);
    } catch (error) {
      // Log failed API request
      await logRequest(
        req,
        {
          userId: null, // Public API - no user
          status: error.statusCode || 500,
          body: { success: false, message: error.message },
          requestBodyLog,
          error: error.message,
          stackTrace: error.stack,
        },
        requestStartTime,
        next
      );

      return next(error);
    }
  })().catch(next);
});

module.exports = {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties,
};
