const {
  Property,
  PropertyManagerNotes,
  User,
  PropertyMedia,
  PropertyNotificationEvent,
} = require("../models");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { attachSignedUrls } = require("../utils/gcsHelper");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { getIO } = require("../config/socket");

// ============================================
// 1) CREATE/UPDATE NOTES - Push notes to array
// ============================================

/**
 * Create or update property manager notes for a property
 * First call: Creates record with notes array
 * Subsequent calls: Pushes new notes to existing array
 */
const createPropertyManagerNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { notes } = req.body; // Array of {note, createdAt}
  const salesExecutiveId = req.user.userId; // ✅ Fixed variable name

  const requestBodyLog = {
    propertyId,
    notesCount: notes?.length || 0,
  };

  try {
    // Validate notes array
    if (!notes || !Array.isArray(notes)) {
      throw createAppError("notes must be an array", 400);
    }

    if (notes.length === 0) {
      throw createAppError("At least one note is required", 400);
    }

    if (notes.length > 50) {
      throw createAppError("Maximum 50 notes can be added at once", 400);
    }

    // Validate each note object
    for (let i = 0; i < notes.length; i++) {
      const noteItem = notes[i];

      // Validate note text
      if (!noteItem.note || typeof noteItem.note !== "string") {
        throw createAppError(
          `Note at index ${i}: note field is required and must be a string`,
          400
        );
      }

      if (noteItem.note.trim().length === 0) {
        throw createAppError(`Note at index ${i}: note cannot be empty`, 400);
      }

      if (noteItem.note.length > 5000) {
        throw createAppError(
          `Note at index ${i}: note cannot exceed 5000 characters`,
          400
        );
      }

      // Validate createdAt (optional, will use current timestamp if not provided)
      if (noteItem.createdAt) {
        const date = new Date(noteItem.createdAt);
        if (isNaN(date.getTime())) {
          throw createAppError(
            `Note at index ${i}: invalid createdAt date format`,
            400
          );
        }
      }
    }

    // ✅ Relaxed permission: Admin and Sales Manager can add notes to any property
    const isAdminOrManager = ["Admin", "Super Admin", "Sales Manager"].includes(
      req.user.role
    );

    const where = { propertyId, isActive: true };
    if (!isAdminOrManager) {
      where.salesId = salesExecutiveId; // Sales Executives can only add notes to their assigned properties
    }

    const property = await Property.findOne({
      where,
      attributes: [
        "propertyId",
        "salesId",
        "ownerId",
        "brokerId",
        "city",
        "state",
      ],
    });

    if (!property) {
      throw createAppError(
        isAdminOrManager
          ? "Property not found"
          : "Property not found or you don't have permission to add notes",
        404
      );
    }

    const transaction = await sequelize.transaction();

    try {
      // ✅ FIXED: Use correct column name
      let noteRecord = await PropertyManagerNotes.findOne({
        where: {
          propertyId,
          salesExecutiveId, // ✅ Correct column name
        },
        transaction,
      });

      let isNew = false;
      let addedNotes = [];

      if (!noteRecord) {
        // ✅ CREATE: First time - create with notes array
        const notesWithTimestamp = notes.map((n) => ({
          note: n.note,
          createdAt: n.createdAt || new Date().toISOString(),
        }));

        noteRecord = await PropertyManagerNotes.create(
          {
            propertyId,
            salesExecutiveId, // ✅ Correct column name
            notes: notesWithTimestamp,
            totalNotesCount: notesWithTimestamp.length,
            isActive: true,
          },
          { transaction }
        );

        addedNotes = notesWithTimestamp;
        isNew = true;
      } else {
        // ✅ UPDATE: Push new notes to existing array
        const notesWithTimestamp = notes.map((n) => ({
          note: n.note,
          createdAt: n.createdAt || new Date().toISOString(),
        }));

        PropertyManagerNotes.pushNotes(noteRecord, notesWithTimestamp);
        await noteRecord.save({ transaction });

        addedNotes = notesWithTimestamp;
        isNew = false;
      }

      await transaction.commit();

      // Notify property owner (and broker) that notes were added by the sales exec
      try {
        const io = getIO();
        const salesExecName = `${req.user.firstName} ${req.user.lastName}`;
        const message = `${salesExecName} added notes to your property in ${property.city}`;
        const recipientIds = [property.ownerId, property.brokerId].filter(Boolean);

        if (recipientIds.length > 0) {
          const notificationRecords = recipientIds.map((uid) => ({
            propertyId: property.propertyId,
            userId: uid,
            notificationText: message,
          }));
          await PropertyNotificationEvent.bulkCreate(notificationRecords);

          const timestamp = new Date().toISOString();
          recipientIds.forEach((uid) => {
            io.to(`user:${uid}`).emit("property:notes_added", {
              propertyId: property.propertyId,
              message,
              addedBy: req.user.userId,
              timestamp,
            });
          });
        }
      } catch (notifErr) {
        console.error(
          "Notification failed in createPropertyManagerNotes:",
          notifErr.message
        );
      }

      await logRequest(
        req,
        {
          userId: req.user.userId,
          status: isNew ? 201 : 200,
          body: {
            success: true,
            message: isNew
              ? "Notes created successfully"
              : "Notes added successfully",
            notesAdded: addedNotes.length,
          },
          requestBodyLog,
        },
        requestStartTime
      );

      return sendEncodedResponse(
        res,
        isNew ? 201 : 200,
        true,
        isNew ? "Notes created successfully" : "Notes added successfully",
        {
          notesAdded: addedNotes.length,
          addedNotes: addedNotes,
          totalNotes: noteRecord.totalNotesCount,
          isNew: isNew,
        }
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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

// ============================================
// 2) GET ALL PROPERTIES WITH NOTES (Sales Agent Filter)
// ============================================

/**
 * Get all properties with property manager notes assigned to logged-in sales agent
 * Only shows properties where sales_id matches logged-in user (Sales Manager or Sales Executive)
 */
const getAllPropertiesWithNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const salesExecutiveId = req.user.userId; // ✅ Fixed variable name
  const {
    page = 1,
    limit = 10,
    sortBy = "updatedAt",
    sortOrder = "DESC",
  } = req.query;

  const requestBodyLog = {
    salesExecutiveId, // ✅ Fixed
    page,
    limit,
    sortBy,
    sortOrder,
  };

  try {
    // Build where clause for PropertyManagerNotes
    const noteWhereClause = {
      salesExecutiveId, // ✅ Filter by logged-in sales executive
      isActive: true,
    };

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    // Find all PropertyManagerNotes with properties assigned to this sales agent
    const { count, rows: noteRecords } =
      await PropertyManagerNotes.findAndCountAll({
        where: noteWhereClause,
        include: [
          {
            model: Property,
            as: "property",
            required: true, // INNER JOIN - only notes with valid properties
            where: {
              isActive: true,
            },
            attributes: [
              "propertyId",
              "propertyType",
              "city",
              "state",
              "microMarket",
              "carpetArea",
              "carpetAreaUnit",
              "sellingPrice",
              "totalMonthlyRent",
              "sellingStatus",
              "isVerified",
              "createdAt",
            ],
            include: [
              {
                model: PropertyMedia,
                as: "media",
                attributes: ["mediaId", "mediaType", "fileUrl"],
                required: false,
                limit: 1,
                separate: true,
              },
            ],
          },
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: pageSize,
        offset: offset,
        distinct: true,
      });

    // Attach signed URLs to media
    const notesWithSignedUrls = await Promise.all(
      noteRecords.map(async (record) => {
        const recordData = record.toJSON();

        if (
          recordData.property?.media &&
          recordData.property.media.length > 0
        ) {
          recordData.property.media = await attachSignedUrls(
            recordData.property.media
          );
        }

        // Sort notes by latest first
        recordData.notes = PropertyManagerNotes.getAllNotes(record);

        return recordData;
      })
    );

    const totalPages = Math.ceil(count / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Properties with notes fetched successfully",
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
      "Properties with notes fetched successfully",
      notesWithSignedUrls,
      {
        pagination: {
          currentPage: pageNumber,
          pageSize: pageSize,
          totalItems: count,
          totalPages: totalPages,
          hasNextPage: hasNextPage,
          hasPrevPage: hasPrevPage,
        },
        assignedTo: {
          salesExecutiveId: salesExecutiveId, // ✅ Fixed
          role: req.user.roles, // ✅ Changed from role to roles (array)
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

// ============================================
// 3) GET SPECIFIC PROPERTY WITH NOTES (Sales Agent Filter)
// ============================================

/**
 * Get a specific property with all property manager notes
 * Only accessible if property's sales_id matches logged-in sales agent
 */
const getPropertyWithNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const salesExecutiveId = req.user.userId;

  const requestBodyLog = {
    propertyId,
    salesExecutiveId,
  };

  try {
    // ✅ Relaxed permission: Admin and Sales Manager can view any property notes
    const isAdminOrManager = ["Admin", "Super Admin", "Sales Manager"].includes(
      req.user.role
    );

    const where = { propertyId, isActive: true };
    if (!isAdminOrManager) {
      where.salesId = salesExecutiveId; // Sales Executives only see notes for assigned properties
    }

    // ✅ OPTIMIZED: Single query with LEFT JOIN to property_manager_notes
    const property = await Property.findOne({
      where,
      attributes: [
        "propertyId",
        "propertyType",
        "city",
        "state",
        "microMarket",
        "carpetArea",
        "carpetAreaUnit",
        "completionYear",
        "buildingGrade",
        "ownershipType",
        "sellingPrice",
        "totalMonthlyRent",
        "annualGrossRent",
        "grossRentalYield",
        "sellingStatus",
        "isVerified",
        "description",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: PropertyMedia,
          as: "media",
          attributes: ["mediaId", "mediaType", "fileUrl"],
          required: false,
        },
        {
          model: User,
          as: "owner",
          attributes: ["userId", "firstName", "lastName", "email"],
          required: false,
        },
        {
          model: User,
          as: "broker",
          attributes: ["userId", "firstName", "lastName", "email"],
          required: false,
        },
        // ✅ NEW: Include PropertyManagerNotes in same query
        {
          model: PropertyManagerNotes,
          as: "managerNotes", // Use the alias from your index.js associations
          where: {
            salesExecutiveId, // Filter notes for this sales exec
            isActive: true,
          },
          required: false, // LEFT JOIN - property can exist without notes
          include: [
            {
              model: User,
              as: "salesExecutive",
              attributes: [
                "userId",
                "firstName",
                "lastName",
                "email",
                "mobileNumber",
              ],
              required: false,
            },
          ],
        },
      ],
    });

    if (!property) {
      throw createAppError(
        "Property not found or you don't have permission to view it",
        404
      );
    }

    // Attach signed URLs to media
    const propertyData = property.toJSON();
    if (propertyData.media && propertyData.media.length > 0) {
      propertyData.media = await attachSignedUrls(propertyData.media);
    }

    // ✅ Extract and format notes
    let formattedNotes = null;
    let totalNotes = 0;

    if (propertyData.managerNotes && propertyData.managerNotes.length > 0) {
      // Since composite PK (propertyId, salesExecutiveId), there should be only 1 record
      const noteRecord = propertyData.managerNotes[0];

      // Sort notes by latest first
      noteRecord.notes = noteRecord.notes.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      formattedNotes = noteRecord;
      totalNotes = noteRecord.totalNotesCount;
    }

    // Remove managerNotes from property object to avoid duplication in response
    delete propertyData.managerNotes;

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Property with notes fetched successfully",
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Property with notes fetched successfully",
      {
        property: propertyData,
        notes: formattedNotes,
        totalNotes: totalNotes,
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

// ============================================
// 4) GET PROPERTY NOTES — Owner Dashboard
// ============================================

/**
 * Owner can view all notes added by the sales executive on their property.
 * Filter: property.ownerId = req.user.userId
 */
const getPropertyNotesByOwner = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const ownerId = req.user.userId;

  const requestBodyLog = { propertyId, ownerId };

  try {
    const property = await Property.findOne({
      where: { propertyId, ownerId, isActive: true },
      attributes: ["propertyId", "propertyType", "city", "state", "microMarket"],
      include: [
        {
          model: PropertyManagerNotes,
          as: "managerNotes",
          where: { isActive: true },
          required: false,
          include: [
            {
              model: User,
              as: "salesExecutive",
              attributes: ["userId", "firstName", "lastName", "email"],
              required: false,
            },
          ],
        },
      ],
    });

    if (!property) {
      throw createAppError("Property not found or you don't have access", 404);
    }

    const data = property.toJSON();
    if (data.managerNotes) {
      data.managerNotes = data.managerNotes.map((record) => {
        record.notes = (record.notes || []).sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        return record;
      });
    }

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: { success: true, message: "Notes fetched successfully" },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, "Notes fetched successfully", data);
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

/**
 * Owner can view all notes for all their properties in one list.
 * Filter: property.ownerId = req.user.userId
 */
const getAllOwnerNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const ownerId = req.user.userId;

  try {
    const properties = await Property.findAll({
      where: { ownerId, isActive: true },
      attributes: ["propertyId", "microMarket", "city", "state"],
      include: [
        {
          model: PropertyManagerNotes,
          as: "managerNotes",
          where: { isActive: true },
          required: true, // Only fetch properties that actually have notes
          include: [
            {
              model: User,
              as: "salesExecutive",
              attributes: ["userId", "firstName", "lastName", "email"],
              required: false,
            },
          ],
        },
      ],
    });

    // Flatten it into a list of notes with property context
    const allNotes = [];
    properties.forEach((prop) => {
      const propData = prop.toJSON();
      if (propData.managerNotes) {
        propData.managerNotes.forEach((record) => {
          record.notes.forEach((n) => {
            allNotes.push({
              note: n.note,
              createdAt: n.createdAt,
              propertyId: propData.propertyId,
              microMarket: propData.microMarket,
              location: `${propData.city}, ${propData.state}`,
              addedBy: record.salesExecutive
                ? `${record.salesExecutive.firstName} ${record.salesExecutive.lastName}`
                : "System",
            });
          });
        });
      }
    });

    // Sort all notes by latest first
    allNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "All owner notes fetched successfully",
          count: allNotes.length,
        },
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "All notes fetched successfully",
      allNotes
    );
  } catch (error) {
    return next(error);
  }
});
/**
 * Owner can add notes to their own property until it is completely verified.
 */
const addOwnerNoteForProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { note } = req.body;
  const ownerId = req.user.userId;

  const requestBodyLog = { propertyId, ownerId };

  try {
    if (!note || typeof note !== "string" || note.trim().length === 0) {
      throw createAppError("A valid note is required", 400);
    }

    const noteText = note.trim();
    if (noteText.length > 5000) {
      throw createAppError("Note cannot exceed 5000 characters", 400);
    }

    const property = await Property.findOne({
      where: { propertyId, ownerId, isActive: true },
      attributes: ["propertyId", "isVerified"],
    });

    if (!property) {
      throw createAppError("Property not found or you don't have access", 404);
    }

    if (property.isVerified === "completed") {
      throw createAppError("Cannot add notes to a property that is fully verified", 403);
    }

    const transaction = await sequelize.transaction();

    try {
      // Use the ownerId as salesExecutiveId, as that's how notes are grouped by user for this property.
      // This will neatly show up in the owner's name since the relationship hooks to User table.
      let noteRecord = await PropertyManagerNotes.findOne({
        where: {
          propertyId,
          salesExecutiveId: ownerId,
        },
        transaction,
      });

      const noteObj = {
        note: noteText,
        createdAt: new Date().toISOString(),
      };

      if (!noteRecord) {
        await PropertyManagerNotes.create(
          {
            propertyId,
            salesExecutiveId: ownerId,
            notes: [noteObj],
            totalNotesCount: 1,
            isActive: true,
          },
          { transaction }
        );
      } else {
        PropertyManagerNotes.pushNotes(noteRecord, [noteObj]);
        await noteRecord.save({ transaction });
      }

      await transaction.commit();

      await logRequest(
        req,
        {
          userId: ownerId,
          status: 201,
          body: { success: true, message: "Note added successfully" },
          requestBodyLog,
        },
        requestStartTime
      );

      return sendEncodedResponse(
        res,
        201,
        true,
        "Note added successfully",
        { note: noteObj }
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
  createPropertyManagerNotes,
  getAllPropertiesWithNotes,
  getPropertyWithNotes,
  getPropertyNotesByOwner,
  getAllOwnerNotes,
  addOwnerNoteForProperty,
};
