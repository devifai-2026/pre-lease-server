const {
  Property,
  PropertyMedia,
  Amenity,
  Caretaker,
  User,
  Role,
  PropertyCertification,
  PropertyConnectivity,
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
const { Op } = require("sequelize");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { attachSignedUrls } = require("../utils/gcsHelper");

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

    // ✅ NEW: Connectivity Details (Array of objects)
    // Format: [{ connectivityType: "Railway Station", name: "Mumbai Central", distanceKm: 2.5 }, ...]
    connectivityDetails,

    // ✅ NEW: Certifications (Array or object)
    // Format: { rera: true, leed: true, igbc: false, others: ["ISO 9001", "Green Building"] }
    certifications,
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
    connectivityCount: connectivityDetails ? connectivityDetails.length : 0, // ✅ Added
    certificationsCount: certifications
      ? Object.keys(certifications).filter((k) => certifications[k]).length
      : 0, // ✅ Added
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

      // ============================================
      // VALIDATION: Caretaker
      // ============================================
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

      // ============================================
      // VALIDATION: Connectivity Details
      // ============================================
      if (connectivityDetails && !Array.isArray(connectivityDetails)) {
        throw createAppError("connectivityDetails must be an array", 400);
      }

      // Validate each connectivity entry
      if (connectivityDetails && connectivityDetails.length > 0) {
        connectivityDetails.forEach((conn, index) => {
          if (!conn.connectivityType) {
            throw createAppError(
              `Connectivity entry ${index + 1}: connectivityType is required`,
              400
            );
          }
          // Name and distance are optional but should be valid if provided
          if (conn.distanceKm && isNaN(parseFloat(conn.distanceKm))) {
            throw createAppError(
              `Connectivity entry ${index + 1}: distanceKm must be a number`,
              400
            );
          }
        });
      }

      // ============================================
      // START TRANSACTION
      // ============================================
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
                  fileUrl: file.gcsPath,
                },
                { transaction: t }
              );
            })
          );
        }

        // ============================================
        // STEP 4: ✅ Create Connectivity Entries
        // ============================================
        let connectivityRecords = [];
        if (connectivityDetails && connectivityDetails.length > 0) {
          connectivityRecords = await Promise.all(
            connectivityDetails.map((conn) =>
              PropertyConnectivity.create(
                {
                  propertyId: property.propertyId,
                  connectivityType: conn.connectivityType,
                  name: conn.name || null,
                  distanceKm: conn.distanceKm
                    ? parseFloat(conn.distanceKm)
                    : null,
                },
                { transaction: t }
              )
            )
          );
        }

        // ============================================
        // STEP 5: ✅ Create Certification Entries
        // ============================================
        let certificationRecords = [];
        if (certifications) {
          const certificationsToInsert = [];

          // ============================================
          // 5.1: Handle Predefined Certifications (RERA, LEED, IGBC)
          // ============================================
          const predefinedCerts = ["RERA", "LEED", "IGBC"];

          for (const certType of predefinedCerts) {
            const certKey = certType.toLowerCase();
            if (certifications[certKey] === true) {
              certificationsToInsert.push({
                propertyId: property.propertyId,
                certificationType: certType,
                certificationDetails: null, // No details for checkbox certifications
              });
            }
          }

          // ============================================
          // 5.2: Handle "Others" Certifications (Custom Text Input)
          // ============================================
          if (certifications.others && Array.isArray(certifications.others)) {
            certifications.others.forEach((otherCert, index) => {
              if (otherCert && otherCert.trim()) {
                certificationsToInsert.push({
                  propertyId: property.propertyId,
                  certificationType: `OTHER_${index + 1}`, // ✅ Make unique for composite key
                  certificationDetails: otherCert.trim(),
                });
              }
            });
          }

          // ============================================
          // 5.3: Bulk Insert All Certifications at Once
          // ============================================
          if (certificationsToInsert.length > 0) {
            certificationRecords = await PropertyCertification.bulkCreate(
              certificationsToInsert,
              {
                transaction: t,
                validate: true, // ✅ Run validations
              }
            );
          }
        }

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

            // Ownership
            ownerId: property.ownerId,
            brokerId: property.brokerId,
            caretakerId: property.caretakerId,

            // Metadata
            createdBy: userRole,
            amenityCount: amenityIds ? amenityIds.length : 0,
            mediaCount: mediaRecords.length,
            connectivityCount: connectivityRecords.length, // ✅ Added
            certificationCount: certificationRecords.length, // ✅ Added
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
          connectivityCount: connectivityRecords.length, // ✅ Added
          certificationCount: certificationRecords.length, // ✅ Added
          createdByRole: userRole,
        };
      });

      // ============================================
      // PREPARE RESPONSE
      // ============================================
      const data = {
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
        connectivityCount: result.connectivityCount, // ✅ Added
        certificationCount: result.certificationCount, // ✅ Added
      };

      // ============================================
      // LOG SUCCESSFUL REQUEST
      // ============================================
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

      return sendEncodedResponse(
        res,
        201,
        true,
        "Property created successfully",
        data
      );
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
                  fileUrl: file.gcsPath,
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

      const data = {
        propertyId: result.property.propertyId,
        updatedBy: userRole,
        updatedFields: result.updatedFields,
        newMediaCount: result.newMedia.length,
        amenitiesUpdated: result.amenitiesUpdated,
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

      return sendEncodedResponse(
        res,
        200,
        true,
        "Property updated successfully",
        data
      );
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
    endpoint: "/api/v1/amenities",
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

      return sendEncodedResponse(
        res,
        200,
        true,
        "Amenities fetched successfully",
        amenities,
        {
          count: amenities.length,
        }
      );
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
    endpoint: "/api/v1/caretakers",
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

      return sendEncodedResponse(
        res,
        200,
        true,
        "Caretakers fetched successfully",
        caretakers,
        {
          count: caretakers.length,
        }
      );
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

      // Build comparison response with signed URLs for media
      const comparisonProperties = await Promise.all(
        properties.map(async (property) => ({
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
          media: await attachSignedUrls(property.media || []),
          caretaker: property.caretaker || null,
          description: property.description,
          additionalDescription: property.additionalDescription,
        }))
      );

      const comparison = {
        propertiesCompared: properties.length,
        properties: comparisonProperties,
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

      return sendEncodedResponse(
        res,
        200,
        true,
        "Properties comparison fetched successfully",
        comparison
      );
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

// ============================================
// GET ALL PROPERTIES WITH FILTERS & PAGINATION
// ============================================
const getAllProperties = asyncHandler((req, res, next) => {
  const requestStartTime = Date.now();

  const {
    // Pagination
    page = 1,
    limit = 10,

    // Pricing Filter
    minPrice,
    maxPrice,

    // Property Type Filter
    propertyTypes, // comma-separated: "Residential,Commercial,Industrial"

    // Annual Rent Filter
    minRent,
    maxRent,

    // ROI Filter
    minROI,
    maxROI,

    // Tenure Left Filter
    minTenure,
    maxTenure,

    // Location Filters
    city,
    state,
    microMarket,

    // Sorting
    sortBy = "createdAt", // createdAt, sellingPrice, annualGrossRent, grossRentalYield, etc.
    sortOrder = "DESC", // ASC or DESC
  } = req.query;

  const requestBodyLog = {
    page,
    limit,
    filters: {
      pricing: { minPrice, maxPrice },
      propertyTypes,
      rent: { minRent, maxRent },
      roi: { minROI, maxROI },
      tenure: { minTenure, maxTenure },
      location: { city, state, microMarket },
    },
    sortBy,
    sortOrder,
  };

  return (async () => {
    try {
      // ============================================
      // BUILD WHERE CLAUSE
      // ============================================
      const whereClause = {
        isActive: true,
      };

      // ✅ PRICING FILTER
      if (minPrice || maxPrice) {
        whereClause.sellingPrice = {};
        if (minPrice) {
          whereClause.sellingPrice[Op.gte] = parseFloat(minPrice);
        }
        if (maxPrice) {
          whereClause.sellingPrice[Op.lte] = parseFloat(maxPrice);
        }
      }

      // ✅ PROPERTY TYPE FILTER
      if (propertyTypes) {
        const typesArray = propertyTypes.split(",").map((type) => type.trim());
        whereClause.propertyType = {
          [Op.in]: typesArray,
        };
      }

      // ✅ ANNUAL RENT FILTER
      if (minRent || maxRent) {
        whereClause.annualGrossRent = {};
        if (minRent) {
          whereClause.annualGrossRent[Op.gte] = parseFloat(minRent);
        }
        if (maxRent) {
          whereClause.annualGrossRent[Op.lte] = parseFloat(maxRent);
        }
      }

      // ✅ ROI FILTER (Gross Rental Yield)
      if (minROI || maxROI) {
        whereClause.grossRentalYield = {};
        if (minROI) {
          whereClause.grossRentalYield[Op.gte] = parseFloat(minROI);
        }
        if (maxROI) {
          whereClause.grossRentalYield[Op.lte] = parseFloat(maxROI);
        }
      }

      // ✅ TENURE LEFT FILTER (Calculate from lease end date)
      if (minTenure || maxTenure) {
        const now = new Date();

        // Convert tenure years to dates
        if (minTenure) {
          const minDate = new Date(now);
          minDate.setFullYear(minDate.getFullYear() + parseInt(minTenure));
          whereClause.leaseEndDate = whereClause.leaseEndDate || {};
          whereClause.leaseEndDate[Op.gte] = minDate;
        }

        if (maxTenure) {
          const maxDate = new Date(now);
          maxDate.setFullYear(maxDate.getFullYear() + parseInt(maxTenure));
          whereClause.leaseEndDate = whereClause.leaseEndDate || {};
          whereClause.leaseEndDate[Op.lte] = maxDate;
        }
      }

      // ✅ LOCATION FILTERS (Support both single and multiple values)
      if (city) {
        if (city.includes(",")) {
          // Multiple cities - exact match for each
          const citiesArray = city.split(",").map((c) => c.trim());
          whereClause.city = {
            [Op.in]: citiesArray,
          };
        } else {
          // Single city - partial match (case-insensitive)
          whereClause.city = {
            [Op.iLike]: `%${city}%`,
          };
        }
      }

      if (state) {
        if (state.includes(",")) {
          // Multiple states - exact match for each
          const statesArray = state.split(",").map((s) => s.trim());
          whereClause.state = {
            [Op.in]: statesArray,
          };
        } else {
          // Single state - partial match (case-insensitive)
          whereClause.state = {
            [Op.iLike]: `%${state}%`,
          };
        }
      }

      if (microMarket) {
        if (microMarket.includes(",")) {
          // Multiple micro markets - exact match for each
          const microMarketsArray = microMarket.split(",").map((m) => m.trim());
          whereClause.microMarket = {
            [Op.in]: microMarketsArray,
          };
        } else {
          // Single micro market - partial match (case-insensitive)
          whereClause.microMarket = {
            [Op.iLike]: `%${microMarket}%`,
          };
        }
      }

      // ============================================
      // PAGINATION SETUP
      // ============================================
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
      const offset = (pageNumber - 1) * pageSize;

      // ============================================
      // FETCH PROPERTIES
      // ============================================
      const { count, rows: properties } = await Property.findAndCountAll({
        where: whereClause,
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

          // Metadata
          "createdAt",
          "updatedAt",
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
            limit: 1, // First image only for listing
            separate: true, // Avoid N+1 query issues
          },
          {
            model: Caretaker,
            as: "caretaker",
            attributes: ["caretakerId", "caretakerName"],
            where: { isActive: true },
            required: false,
          },
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: pageSize,
        offset: offset,
        distinct: true, // Important for correct count with includes
      });

      // ============================================
      // CALCULATE TENURE LEFT & GENERATE SIGNED URLS
      // ============================================
      const propertiesWithTenure = await Promise.all(
        properties.map(async (property) => {
          const propertyData = property.toJSON();

          // Calculate tenure left if lease end date exists
          if (propertyData.leaseEndDate) {
            const now = new Date();
            const leaseEnd = new Date(propertyData.leaseEndDate);
            const diffTime = leaseEnd - now;
            const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
            propertyData.tenureLeftYears = Math.max(
              0,
              parseFloat(diffYears.toFixed(2))
            );
          } else {
            propertyData.tenureLeftYears = null;
          }

          // Generate signed URLs for media
          if (propertyData.media && propertyData.media.length > 0) {
            propertyData.media = await attachSignedUrls(propertyData.media);
          }

          return propertyData;
        })
      );

      // ============================================
      // PAGINATION METADATA
      // ============================================
      const totalPages = Math.ceil(count / pageSize);
      const hasNextPage = pageNumber < totalPages;
      const hasPrevPage = pageNumber > 1;

      // Log successful API request
      await logRequest(
        req,
        {
          userId: req.user?.userId || null,
          status: 200,
          body: {
            success: true,
            message: "Properties fetched successfully",
            count: count,
          },
          requestBodyLog,
        },
        requestStartTime,
        next
      );

      return sendEncodedResponse(
        res,
        200,
        true,
        "Properties fetched successfully",
        propertiesWithTenure,
        {
          pagination: {
            currentPage: pageNumber,
            pageSize: pageSize,
            totalItems: count,
            totalPages: totalPages,
            hasNextPage: hasNextPage,
            hasPrevPage: hasPrevPage,
          },
          filters: {
            applied: {
              pricing: minPrice || maxPrice ? { minPrice, maxPrice } : null,
              propertyTypes: propertyTypes || null,
              rent: minRent || maxRent ? { minRent, maxRent } : null,
              roi: minROI || maxROI ? { minROI, maxROI } : null,
              tenure: minTenure || maxTenure ? { minTenure, maxTenure } : null,
              location:
                city || state || microMarket
                  ? { city, state, microMarket }
                  : null,
            },
          },
        }
      );
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

module.exports = {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties,
  getAllProperties,
};
