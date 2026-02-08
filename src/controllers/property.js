// controllers/property.js

const { Property, PropertyMedia } = require("../models");
const { sequelize } = require("../config/dbConnection");
const createAppError = require("../utils/appError");
const { validateRequiredFields } = require("../utils/validators");
const asyncHandler = require("../utils/asyncHandler");

// Create property with S3 media uploads
const createProperty = asyncHandler(async (req, res, next) => {
  // Extract all fields from request body
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

    // Location (only city and state could be required based on your needs)
    microMarket,
    city,
    state,

    // Market Intelligence
    demandDrivers,
    upcomingDevelopments,

    // Property Description
    description,
    otherAmenities,
  } = req.body;

  // Validate required fields (customize based on your business rules)
  // For now, let's say only city and state are required
  const requiredFields = ["city", "state"];
  const missing = validateRequiredFields(requiredFields, req.body);
  if (missing.length > 0) {
    return next(
      createAppError(`Missing required fields: ${missing.join(", ")}`, 400)
    );
  }

  // Start transaction
  const result = await sequelize.transaction(async (t) => {
    // Create property with all fields (nullable ones will be null if not provided)
    const property = await Property.create(
      {
        ownerId: req.user.userId, // From auth middleware

        // Basic Details
        propertyType: propertyType || null,
        carpetAreaSqft: carpetAreaSqft || null,
        lastRefurbished: lastRefurbished || null,
        ownershipType: ownershipType || null,
        buildingGrade: buildingGrade || null,

        // Parking
        parkingSlots: parkingSlots || null,
        parkingRatio: parkingRatio || null,

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
        city, // Required
        state, // Required

        // Market Intelligence
        demandDrivers: demandDrivers || null,
        upcomingDevelopments: upcomingDevelopments || null,

        // Property Description
        description: description || null,
        otherAmenities: otherAmenities || null,

        // Metadata
        isActive: true,
      },
      { transaction: t }
    );

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
              fileUrl: file.location || file.path, // S3 URL or local path
            },
            { transaction: t }
          );
        })
      );
    }

    return {
      property,
      media: mediaRecords,
    };
  });

  return res.status(201).json({
    success: true,
    message: "Property created successfully",
    data: {
      propertyId: result.property.propertyId,
      city: result.property.city,
      state: result.property.state,
      propertyType: result.property.propertyType,
      mediaCount: result.media.length,
    },
  });
});

// Update property (allows updating any field except ownerId and propertyId)
const updateProperty = asyncHandler(async (req, res, next) => {
  const { propertyId } = req.params;

  // Check if property exists and user owns it
  const existingProperty = await Property.findOne({
    where: {
      propertyId,
      ownerId: req.user.userId,
    },
  });

  if (!existingProperty) {
    return next(createAppError("Property not found or unauthorized", 404));
  }

  // Remove protected fields from update data
  const { ownerId, propertyId: propId, ...updateData } = req.body;

  // Warn if someone tried to update protected fields
  if (ownerId || propId) {
    console.warn(
      `Attempt to update protected fields by user ${req.user.userId}`
    );
  }

  // Check if there's anything to update
  if (
    Object.keys(updateData).length === 0 &&
    (!req.files || req.files.length === 0)
  ) {
    return next(createAppError("No fields to update", 400));
  }

  // Start transaction
  const result = await sequelize.transaction(async (t) => {
    // Update property with all provided fields (except protected ones)
    if (Object.keys(updateData).length > 0) {
      await existingProperty.update(updateData, { transaction: t });
    }

    // Upload new media files if provided
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

    return {
      property: existingProperty,
      updatedFields: Object.keys(updateData),
      newMedia: newMediaRecords,
    };
  });

  return res.status(200).json({
    success: true,
    message: "Property updated successfully",
    data: {
      propertyId: result.property.propertyId,
      updatedFields: result.updatedFields,
      newMediaCount: result.newMedia.length,
    },
  });
});

module.exports = {
  createProperty,
  updateProperty,
};
