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

module.exports = {
  createProperty,
  updateProperty,
};
