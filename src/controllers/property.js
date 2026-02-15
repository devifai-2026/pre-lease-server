const {
  Property,
  PropertyMedia,
  Amenity,
  Caretaker,
  User,
  Role,
  UserRole,
  PropertyCertification,
  PropertyConnectivity,
} = require("../models");
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
const { getIO } = require("../config/socket");

const ALLOWED_UPDATE_FIELDS = [
  "propertyType",
  "carpetAreaSqft",
  "carpetAreaUnit",
  "completionYear",
  "lastRefurbished",
  "ownershipType",
  "buildingGrade",
  "parkingSlots",
  "parkingRatio",
  "powerBackupKva",
  "numberOfLifts",
  "hvacType",
  "furnishingStatus",
  "titleStatus",
  "occupancyCertificate",
  "leaseRegistration",
  "hasPendingLitigation",
  "litigationDetails",
  "reraNumber",
  "tenantType",
  "leaseStartDate",
  "leaseEndDate",
  "lockInPeriodYears",
  "lockInPeriodMonths",
  "leaseDurationYears",
  "rentType",
  "rentPerSqftMonthly",
  "totalMonthlyRent",
  "securityDepositType",
  "securityDepositMonths",
  "securityDepositAmount",
  "escalationFrequencyYears",
  "annualEscalationPercent",
  "maintenanceCostsIncluded",
  "maintenanceType",
  "maintenanceAmount",
  "sellingPrice",
  "propertyTaxAnnual",
  "insuranceAnnual",
  "otherCostsAnnual",
  "additionalIncomeAnnual",
  "annualGrossRent",
  "grossRentalYield",
  "netRentalYield",
  "paybackPeriodYears",
  "microMarket",
  "city",
  "state",
  "demandDrivers",
  "upcomingDevelopments",
  "description",
  "otherAmenities",
];

const createProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const parseIfNeeded = (field) => {
    if (typeof field === "string") {
      try {
        const parsed = JSON.parse(field);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch (e) {
        // not JSON, keep as string
      }
    }
    return field;
  };

  if (req.body.connectivityDetails) {
    req.body.connectivityDetails = parseIfNeeded(req.body.connectivityDetails);
  }
  if (req.body.certifications) {
    req.body.certifications = parseIfNeeded(req.body.certifications);
  }
  if (req.body.amenityIds && typeof req.body.amenityIds === "string") {
    req.body.amenityIds = parseIfNeeded(req.body.amenityIds);
  }

  const {
    propertyType,
    carpetAreaSqft,
    carpetAreaUnit,
    completionYear,
    lastRefurbished,
    ownershipType,
    buildingGrade,
    parkingSlots,
    parkingRatio,
    powerBackupKva,
    numberOfLifts,
    hvacType,
    furnishingStatus,
    titleStatus,
    occupancyCertificate,
    leaseRegistration,
    hasPendingLitigation,
    litigationDetails,
    reraNumber,
    tenantType,
    leaseStartDate,
    leaseEndDate,
    lockInPeriodYears,
    lockInPeriodMonths,
    leaseDurationYears,
    rentType,
    rentPerSqftMonthly,
    totalMonthlyRent,
    securityDepositType,
    securityDepositMonths,
    securityDepositAmount,
    escalationFrequencyYears,
    annualEscalationPercent,
    maintenanceCostsIncluded,
    maintenanceType,
    maintenanceAmount,
    sellingPrice,
    propertyTaxAnnual,
    insuranceAnnual,
    otherCostsAnnual,
    additionalIncomeAnnual,
    annualGrossRent,
    grossRentalYield,
    netRentalYield,
    paybackPeriodYears,
    microMarket,
    city,
    state,
    demandDrivers,
    upcomingDevelopments,
    description,
    otherAmenities,
    amenityIds,
    caretakerId,
    connectivityDetails,
    certifications,
  } = req.body;

  const requestBodyLog = {
    propertyType,
    carpetAreaSqft,
    carpetAreaUnit,
    completionYear,
    lastRefurbished,
    ownershipType,
    buildingGrade,
    city,
    state,
    microMarket,
    tenantType,
    hasLeaseDetails: !!(leaseStartDate || leaseEndDate),
    leaseDurationYears,
    rentType,
    hasRentalDetails: !!(rentPerSqftMonthly || totalMonthlyRent),
    hasFinancialData: !!(sellingPrice || propertyTaxAnnual || insuranceAnnual),
    hasCalculatedMetrics: !!(
      annualGrossRent ||
      grossRentalYield ||
      netRentalYield
    ),
    userRole: req.userRole,
    caretakerId: caretakerId || null,
    amenityCount: amenityIds ? amenityIds.length : 0,
    hasMedia: req.files && req.files.length > 0,
    mediaCount: req.files ? req.files.length : 0,
    connectivityCount: connectivityDetails ? connectivityDetails.length : 0,
    certificationsCount: certifications
      ? Object.keys(certifications).filter((k) => certifications[k]).length
      : 0,
  };

  try {
    const requiredFields = ["city", "state"];
    const missing = validateRequiredFields(requiredFields, req.body);
    if (missing.length > 0) {
      throw createAppError(
        `Missing required fields: ${missing.join(", ")}`,
        400
      );
    }

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

    if (caretakerId) {
      const caretaker = await Caretaker.findOne({
        where: { caretakerId, isActive: true },
      });
      if (!caretaker) {
        throw createAppError("Invalid caretaker ID", 400);
      }
    }

    if (amenityIds && amenityIds.length > 0) {
      const validAmenities = await Amenity.findAll({
        where: { amenityId: amenityIds, isActive: true },
        attributes: ["amenityId"],
      });

      if (validAmenities.length !== amenityIds.length) {
        throw createAppError("One or more invalid amenity IDs provided", 400);
      }
    }

    if (connectivityDetails && !Array.isArray(connectivityDetails)) {
      throw createAppError("connectivityDetails must be an array", 400);
    }

    if (connectivityDetails && connectivityDetails.length > 0) {
      connectivityDetails.forEach((conn, index) => {
        if (!conn.connectivityType) {
          throw createAppError(
            `Connectivity entry ${index + 1}: connectivityType is required`,
            400
          );
        }
        if (conn.distanceKm && isNaN(parseFloat(conn.distanceKm))) {
          throw createAppError(
            `Connectivity entry ${index + 1}: distanceKm must be a number`,
            400
          );
        }
      });
    }

    const salesUsers = await User.findAll({
      where: { isActive: true },
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          where: { roleName: "Sales", isActive: true },
          attributes: [],
        },
      ],
    });

    let assignedSalesId = null;
    if (salesUsers.length > 0) {
      const salesUserIds = salesUsers.map((u) => u.userId);
      const propertyCounts = await Property.findAll({
        where: { salesId: { [Op.in]: salesUserIds }, isActive: true },
        attributes: [
          "salesId",
          [sequelize.fn("COUNT", sequelize.col("property_id")), "propertyCount"],
        ],
        group: ["salesId"],
        raw: true,
      });

      const countMap = {};
      propertyCounts.forEach((row) => {
        countMap[row.salesId] = parseInt(row.propertyCount);
      });

      assignedSalesId = salesUserIds.reduce((minId, id) => {
        const count = countMap[id] || 0;
        const minCount = countMap[minId] || 0;
        return count < minCount ? id : minId;
      }, salesUserIds[0]);
    }

    const result = await sequelize.transaction(async (t) => {
      const propertyData = {
        propertyType: propertyType || null,
        carpetArea: carpetAreaSqft || null,
        carpetAreaUnit: carpetAreaUnit || "Sq. Feet",
        completionYear: completionYear || null,
        lastRefurbishedYear: lastRefurbished || null,
        ownershipType: ownershipType || null,
        buildingGrade: buildingGrade || null,
        parkingFourWheeler: parkingSlots || 0,
        parkingTwoWheeler: parkingRatio || 0,
        powerBackup: powerBackupKva || null,
        numberOfLifts: numberOfLifts || null,
        hvacType: hvacType || null,
        furnishingStatus: furnishingStatus || null,
        maintainedById: caretakerId || null,
        titleStatus: titleStatus || null,
        occupancyCertificate: occupancyCertificate || null,
        leaseRegistration: leaseRegistration || null,
        hasPendingLitigation:
          hasPendingLitigation !== undefined ? hasPendingLitigation : false,
        litigationDetails: litigationDetails || null,
        reraNumber: reraNumber || null,
        tenantType: tenantType || null,
        leaseStartDate: leaseStartDate || null,
        leaseEndDate: leaseEndDate || null,
        lockInPeriodYears: lockInPeriodYears || null,
        lockInPeriodMonths: lockInPeriodMonths || null,
        leaseDurationYears: leaseDurationYears || null,
        rentType: rentType || "Per Sq Ft",
        rentPerSqftMonthly: rentPerSqftMonthly || null,
        totalMonthlyRent: totalMonthlyRent || null,
        securityDepositType: securityDepositType || "Months of Rent",
        securityDepositMonths: securityDepositMonths || null,
        securityDepositAmount: securityDepositAmount || null,
        escalationFrequencyYears: escalationFrequencyYears || null,
        annualEscalationPercent: annualEscalationPercent || null,
        maintenanceCostsIncluded: maintenanceCostsIncluded || null,
        maintenanceType: maintenanceType || null,
        maintenanceAmount: maintenanceAmount || null,
        microMarket: microMarket || null,
        city,
        state,
        demandDrivers: demandDrivers || null,
        upcomingDevelopments: upcomingDevelopments || null,
        description: description || null,
        additionalDescription: otherAmenities || null,
        sellingPrice: sellingPrice || null,
        propertyTaxAnnual: propertyTaxAnnual || null,
        insuranceAnnual: insuranceAnnual || null,
        otherCostsAnnual: otherCostsAnnual || null,
        totalOperatingAnnualCosts:
          parseFloat(propertyTaxAnnual || 0) +
            parseFloat(insuranceAnnual || 0) +
            parseFloat(otherCostsAnnual || 0) || null,
        additionalIncomeAnnual: additionalIncomeAnnual || null,
        annualGrossRent: annualGrossRent || null,
        grossRentalYield: grossRentalYield || null,
        netRentalYield: netRentalYield || null,
        paybackPeriodYears: paybackPeriodYears || null,
        isActive: true,
      };

      if (userRole === "Owner") {
        propertyData.ownerId = req.user.userId;
        propertyData.brokerId = null;
      } else if (userRole === "Broker") {
        propertyData.brokerId = req.user.userId;
        propertyData.ownerId = null;
      }

      if (assignedSalesId) {
        propertyData.salesId = assignedSalesId;
      }

      const property = await Property.create(propertyData, {
        transaction: t,
      });

      if (amenityIds && amenityIds.length > 0) {
        await property.setAmenities(amenityIds, { transaction: t });
      }

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

      let certificationRecords = [];
      if (certifications) {
        const certificationsToInsert = [];
        const predefinedCerts = ["RERA", "LEED", "IGBC"];

        for (const certType of predefinedCerts) {
          const certKey = certType.toLowerCase();
          if (certifications[certKey] === true) {
            certificationsToInsert.push({
              propertyId: property.propertyId,
              certificationType: certType,
              certificationDetails: null,
            });
          }
        }

        if (certifications.others && Array.isArray(certifications.others)) {
          certifications.others.forEach((otherCert, index) => {
            if (otherCert && otherCert.trim()) {
              certificationsToInsert.push({
                propertyId: property.propertyId,
                certificationType: `OTHER_${index + 1}`,
                certificationDetails: otherCert.trim(),
              });
            }
          });
        }

        if (certificationsToInsert.length > 0) {
          certificationRecords = await PropertyCertification.bulkCreate(
            certificationsToInsert,
            { transaction: t, validate: true }
          );
        }
      }

      await logInsert({
        userId: req.user.userId,
        entityType: "Property",
        recordId: property.propertyId,
        newRecord: {
          propertyId: property.propertyId,
          city: property.city,
          state: property.state,
          propertyType: property.propertyType,
          carpetAreaSqft: property.carpetAreaSqft,
          ownershipType: property.ownershipType,
          buildingGrade: property.buildingGrade,
          ownerId: property.ownerId,
          brokerId: property.brokerId,
          salesId: property.salesId,
          caretakerId: property.caretakerId,
          createdBy: userRole,
          amenityCount: amenityIds ? amenityIds.length : 0,
          mediaCount: mediaRecords.length,
          connectivityCount: connectivityRecords.length,
          certificationCount: certificationRecords.length,
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
        connectivityCount: connectivityRecords.length,
        certificationCount: certificationRecords.length,
        createdByRole: userRole,
      };
    });

    const data = {
      propertyId: result.property.propertyId,
      city: result.property.city,
      state: result.property.state,
      propertyType: result.property.propertyType,
      createdBy: result.createdByRole,
      ownerId: result.property.ownerId,
      brokerId: result.property.brokerId,
      salesId: result.property.salesId,
      caretakerId: result.property.caretakerId,
      amenityCount: result.amenityCount,
      mediaCount: result.media.length,
      connectivityCount: result.connectivityCount,
      certificationCount: result.certificationCount,
    };

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
      requestStartTime
    );

    try {
      const io = getIO();
      io.emit("property:created", {
        propertyId: result.property.propertyId,
        city: result.property.city,
        state: result.property.state,
        propertyType: result.property.propertyType,
        createdBy: req.user.userId,
        createdByRole: result.createdByRole,
        timestamp: new Date().toISOString(),
      });
    } catch (socketErr) {
      console.error("Socket notification failed:", socketErr.message);
    }

    return sendEncodedResponse(
      res,
      201,
      true,
      "Property created successfully",
      data
    );
  } catch (error) {
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
      requestStartTime
    );

    return next(error);
  }
});

const updateProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;

  const parseIfNeeded = (field) => {
    if (typeof field === "string") {
      try {
        const parsed = JSON.parse(field);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch (e) {
        // not JSON, keep as string
      }
    }
    return field;
  };

  if (req.body.connectivityDetails) {
    req.body.connectivityDetails = parseIfNeeded(req.body.connectivityDetails);
  }
  if (req.body.certifications) {
    req.body.certifications = parseIfNeeded(req.body.certifications);
  }
  if (req.body.amenityIds && typeof req.body.amenityIds === "string") {
    req.body.amenityIds = parseIfNeeded(req.body.amenityIds);
  }

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

    const oldRecord = existingProperty.toJSON();
    const { amenityIds, caretakerId } = req.body;

    const updateData = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

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

    if (amenityIds && amenityIds.length > 0) {
      const validAmenities = await Amenity.findAll({
        where: { amenityId: amenityIds, isActive: true },
        attributes: ["amenityId"],
      });

      if (validAmenities.length !== amenityIds.length) {
        throw createAppError("One or more invalid amenity IDs provided", 400);
      }
    }

    if (req.body.ownerId || req.body.propertyId || req.body.brokerId) {
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

    const result = await sequelize.transaction(async (t) => {
      if (Object.keys(updateData).length > 0) {
        await existingProperty.update(updateData, { transaction: t });
      }

      let oldAmenityIds = [];
      if (amenityIds) {
        const oldAmenities = await existingProperty.getAmenities({
          attributes: ["amenityId"],
          raw: true,
          transaction: t,
        });
        oldAmenityIds = oldAmenities.map((a) => a.amenityId);
        await existingProperty.setAmenities(amenityIds, { transaction: t });
      }

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

      const { oldValues, newValues } = buildUpdateValues(oldRecord, updateData);

      if (amenityIds) {
        oldValues.amenityIds = oldAmenityIds;
        newValues.amenityIds = amenityIds;
      }

      if (newMediaRecords.length > 0) {
        newValues.mediaAdded = newMediaRecords.length;
      }

      newValues.updatedBy = userRole;

      await logUpdate({
        userId: req.user.userId,
        entityType: "Property",
        recordId: propertyId,
        oldValues,
        newValues,
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

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "Property updated successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    try {
      const io = getIO();
      const prop = result.property;
      const notifyUserIds = [prop.ownerId, prop.brokerId].filter(Boolean);
      notifyUserIds.forEach((uid) => {
        io.to(`user:${uid}`).emit("property:updated", {
          propertyId: prop.propertyId,
          updatedFields: result.updatedFields,
          updatedBy: req.user.userId,
          timestamp: new Date().toISOString(),
        });
      });
    } catch (socketErr) {
      console.error("Socket notification failed:", socketErr.message);
    }

    return sendEncodedResponse(
      res,
      200,
      true,
      "Property updated successfully",
      data
    );
  } catch (error) {
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
      requestStartTime
    );

    return next(error);
  }
});

const getAllAmenities = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const requestBodyLog = {
    userId: req.user?.userId || null,
    endpoint: "/api/v1/amenities",
  };

  try {
    const amenities = await Amenity.findAll({
      where: { isActive: true },
      attributes: ["amenityId", "amenityName"],
      order: [["amenityName", "ASC"]],
      raw: true,
    });

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
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Amenities fetched successfully",
      amenities,
      { count: amenities.length }
    );
  } catch (error) {
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
      requestStartTime
    );

    return next(error);
  }
});

const getAllCaretakers = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const requestBodyLog = {
    userId: req.user?.userId || null,
    endpoint: "/api/v1/caretakers",
  };

  try {
    const caretakers = await Caretaker.findAll({
      where: { isActive: true },
      attributes: ["caretakerId", "caretakerName"],
      order: [["caretakerName", "ASC"]],
      raw: true,
    });

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
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Caretakers fetched successfully",
      caretakers,
      { count: caretakers.length }
    );
  } catch (error) {
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
      requestStartTime
    );

    return next(error);
  }
});

const compareProperties = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { propertyIds } = req.query;

  const requestBodyLog = {
    endpoint: "/api/properties/compare",
    propertyIds: propertyIds || null,
    isPublic: true,
  };

  try {
    if (!propertyIds) {
      throw createAppError(
        "propertyIds query parameter is required (comma-separated UUIDs)",
        400
      );
    }

    const propertyIdArray = propertyIds.split(",").map((id) => id.trim());

    if (propertyIdArray.length < 2) {
      throw createAppError(
        "At least 2 property IDs are required for comparison",
        400
      );
    }

    if (propertyIdArray.length > 3) {
      throw createAppError("Maximum 3 properties can be compared at once", 400);
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = propertyIdArray.filter((id) => !uuidRegex.test(id));

    if (invalidIds.length > 0) {
      throw createAppError(
        `Invalid UUID format for property IDs: ${invalidIds.join(", ")}`,
        400
      );
    }

    const properties = await Property.findAll({
      where: {
        propertyId: propertyIdArray,
        isActive: true,
      },
      attributes: [
        "propertyId",
        "propertyType",
        "carpetArea",
        "carpetAreaUnit",
        "completionYear",
        "lastRefurbishedYear",
        "buildingGrade",
        "ownershipType",
        "parkingTwoWheeler",
        "parkingFourWheeler",
        "powerBackup",
        "numberOfLifts",
        "hvacType",
        "furnishingStatus",
        "titleStatus",
        "occupancyCertificate",
        "leaseRegistration",
        "hasPendingLitigation",
        "reraNumber",
        "tenantType",
        "leaseStartDate",
        "leaseEndDate",
        "lockInPeriodYears",
        "lockInPeriodMonths",
        "leaseDurationYears",
        "rentType",
        "rentPerSqftMonthly",
        "totalMonthlyRent",
        "securityDepositType",
        "securityDepositMonths",
        "securityDepositAmount",
        "escalationFrequencyYears",
        "annualEscalationPercent",
        "maintenanceCostsIncluded",
        "maintenanceType",
        "maintenanceAmount",
        "microMarket",
        "city",
        "state",
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
          limit: 5,
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

    if (properties.length === 0) {
      throw createAppError("No active properties found with provided IDs", 404);
    }

    if (properties.length < propertyIdArray.length) {
      const foundIds = properties.map((p) => p.propertyId);
      const notFoundIds = propertyIdArray.filter(
        (id) => !foundIds.includes(id)
      );
      console.warn(
        `Some properties not found or inactive: ${notFoundIds.join(", ")}`
      );
    }

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

    await logRequest(
      req,
      {
        userId: null,
        status: 200,
        body: {
          success: true,
          message: "Properties comparison fetched successfully",
          propertiesFound: properties.length,
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Properties comparison fetched successfully",
      comparison
    );
  } catch (error) {
    await logRequest(
      req,
      {
        userId: null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        requestBodyLog,
        error: error.message,
        stackTrace: error.stack,
      },
      requestStartTime
    );

    return next(error);
  }
});

const getAllProperties = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const {
    page = 1,
    limit = 10,
    minPrice,
    maxPrice,
    propertyTypes,
    minRent,
    maxRent,
    minROI,
    maxROI,
    minTenure,
    maxTenure,
    city,
    state,
    microMarket,
    sortBy = "createdAt",
    sortOrder = "DESC",
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

  try {
    const whereClause = { isActive: true };

    if (minPrice || maxPrice) {
      whereClause.sellingPrice = {};
      if (minPrice) whereClause.sellingPrice[Op.gte] = parseFloat(minPrice);
      if (maxPrice) whereClause.sellingPrice[Op.lte] = parseFloat(maxPrice);
    }

    if (propertyTypes) {
      const typesArray = propertyTypes.split(",").map((type) => type.trim());
      whereClause.propertyType = { [Op.in]: typesArray };
    }

    if (minRent || maxRent) {
      whereClause.annualGrossRent = {};
      if (minRent) whereClause.annualGrossRent[Op.gte] = parseFloat(minRent);
      if (maxRent) whereClause.annualGrossRent[Op.lte] = parseFloat(maxRent);
    }

    if (minROI || maxROI) {
      whereClause.grossRentalYield = {};
      if (minROI) whereClause.grossRentalYield[Op.gte] = parseFloat(minROI);
      if (maxROI) whereClause.grossRentalYield[Op.lte] = parseFloat(maxROI);
    }

    if (minTenure || maxTenure) {
      const now = new Date();

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

    if (city) {
      if (city.includes(",")) {
        const citiesArray = city.split(",").map((c) => c.trim());
        whereClause.city = { [Op.in]: citiesArray };
      } else {
        whereClause.city = { [Op.iLike]: `%${city}%` };
      }
    }

    if (state) {
      if (state.includes(",")) {
        const statesArray = state.split(",").map((s) => s.trim());
        whereClause.state = { [Op.in]: statesArray };
      } else {
        whereClause.state = { [Op.iLike]: `%${state}%` };
      }
    }

    if (microMarket) {
      if (microMarket.includes(",")) {
        const microMarketsArray = microMarket.split(",").map((m) => m.trim());
        whereClause.microMarket = { [Op.in]: microMarketsArray };
      } else {
        whereClause.microMarket = { [Op.iLike]: `%${microMarket}%` };
      }
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    const { count, rows: properties } = await Property.findAndCountAll({
      where: whereClause,
      attributes: [
        "propertyId",
        "propertyType",
        "carpetArea",
        "carpetAreaUnit",
        "completionYear",
        "lastRefurbishedYear",
        "buildingGrade",
        "ownershipType",
        "parkingTwoWheeler",
        "parkingFourWheeler",
        "powerBackup",
        "numberOfLifts",
        "hvacType",
        "furnishingStatus",
        "titleStatus",
        "occupancyCertificate",
        "leaseRegistration",
        "reraNumber",
        "tenantType",
        "leaseStartDate",
        "leaseEndDate",
        "lockInPeriodYears",
        "lockInPeriodMonths",
        "leaseDurationYears",
        "rentType",
        "rentPerSqftMonthly",
        "totalMonthlyRent",
        "securityDepositType",
        "securityDepositMonths",
        "securityDepositAmount",
        "escalationFrequencyYears",
        "annualEscalationPercent",
        "maintenanceCostsIncluded",
        "maintenanceType",
        "maintenanceAmount",
        "microMarket",
        "city",
        "state",
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
        "description",
        "additionalDescription",
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
          limit: 1,
          separate: true,
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
      distinct: true,
    });

    const propertiesWithTenure = await Promise.all(
      properties.map(async (property) => {
        const propertyData = property.toJSON();

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

        if (propertyData.media && propertyData.media.length > 0) {
          propertyData.media = await attachSignedUrls(propertyData.media);
        }

        return propertyData;
      })
    );

    const totalPages = Math.ceil(count / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

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
      requestStartTime
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
      requestStartTime
    );

    return next(error);
  }
});

module.exports = {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties,
  getAllProperties,
};
