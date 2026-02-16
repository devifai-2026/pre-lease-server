const {
  Property,
  PropertyInvestorNote,
  User,
  PropertyMedia,
} = require("../models");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { attachSignedUrls } = require("../utils/gcsHelper");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");

// ============================================
// 1) CREATE/UPDATE NOTES - Push notes to array
// ============================================

/**
 * Create or update investor notes for a property
 * First call: Creates record with notes array
 * Subsequent calls: Pushes new notes to existing array
 */
const createInvestorNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { notes } = req.body; // Array of {note, createdAt}
  const investorId = req.user.userId;

  const requestBodyLog = {
    propertyId,
    investorId,
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

    // Verify property exists and is active
    const property = await Property.findOne({
      where: { propertyId, isActive: true },
      attributes: ["propertyId", "salesId", "city", "state"],
    });

    if (!property) {
      throw createAppError("Property not found or inactive", 404);
    }

    const transaction = await sequelize.transaction();

    try {
      // Find existing note record
      let noteRecord = await PropertyInvestorNote.findOne({
        where: { propertyId, investorId },
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

        noteRecord = await PropertyInvestorNote.create(
          {
            propertyId,
            investorId,
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

        PropertyInvestorNote.pushNotes(noteRecord, notesWithTimestamp);
        await noteRecord.save({ transaction });

        addedNotes = notesWithTimestamp;
        isNew = false;
      }

      await transaction.commit();

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
 * Get all properties with investor notes assigned to logged-in sales agent
 * Only shows properties where sales_id matches logged-in user (Sales Manager or Sales Executive)
 */
const getAllPropertiesWithNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const salesId = req.user.userId; // Logged-in Sales Manager or Sales Executive

  const {
    page = 1,
    limit = 10,
    investorId, // Optional: filter by specific investor
    sortBy = "updatedAt",
    sortOrder = "DESC",
  } = req.query;

  const requestBodyLog = {
    salesId,
    page,
    limit,
    investorId: investorId || null,
    sortBy,
    sortOrder,
  };

  try {
    // Build where clause for PropertyInvestorNote
    const noteWhereClause = {
      isActive: true,
    };

    if (investorId) {
      noteWhereClause.investorId = investorId;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    // Find all PropertyInvestorNotes with properties assigned to this sales agent
    const { count, rows: noteRecords } =
      await PropertyInvestorNote.findAndCountAll({
        where: noteWhereClause,
        include: [
          {
            model: Property,
            as: "property",
            required: true, // INNER JOIN - only notes with valid properties
            where: {
              salesId: salesId, // ✅ MANDATORY: Filter by logged-in sales agent
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
          {
            model: User,
            as: "investor",
            attributes: [
              "userId",
              "firstName",
              "lastName",
              "email",
              "mobileNumber",
            ],
            required: true,
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
        recordData.notes = PropertyInvestorNote.getAllNotes(record);

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
          message: "Properties with investor notes fetched successfully",
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
      "Properties with investor notes fetched successfully",
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
          salesId: salesId,
          role: req.user.role,
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
 * Get a specific property with all investor notes
 * Only accessible if property's sales_id matches logged-in sales agent
 */
const getPropertyWithNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const salesId = req.user.userId; // Logged-in Sales Manager or Sales Executive

  const requestBodyLog = {
    propertyId,
    salesId,
  };

  try {
    // First, verify the property is assigned to this sales agent
    const property = await Property.findOne({
      where: {
        propertyId,
        salesId: salesId, // ✅ MANDATORY: Must match logged-in sales agent
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
      ],
    });

    if (!property) {
      throw createAppError(
        "Property not found or you don't have permission to view it",
        404
      );
    }

    // Get all investor notes for this property
    const investorNotes = await PropertyInvestorNote.findAll({
      where: {
        propertyId,
        isActive: true,
      },
      include: [
        {
          model: User,
          as: "investor",
          attributes: [
            "userId",
            "firstName",
            "lastName",
            "email",
            "mobileNumber",
          ],
          required: true,
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    // Attach signed URLs to media
    const propertyData = property.toJSON();
    if (propertyData.media && propertyData.media.length > 0) {
      propertyData.media = await attachSignedUrls(propertyData.media);
    }

    // Format investor notes
    const formattedNotes = investorNotes.map((noteRecord) => {
      const recordData = noteRecord.toJSON();
      // Sort notes within each investor's record
      recordData.notes = PropertyInvestorNote.getAllNotes(noteRecord);
      return recordData;
    });

    await logRequest(
      req,
      {
        userId: req.user.userId,
        status: 200,
        body: {
          success: true,
          message: "Property with investor notes fetched successfully",
        },
        requestBodyLog,
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Property with investor notes fetched successfully",
      {
        property: propertyData,
        investorNotes: formattedNotes,
        totalInvestors: formattedNotes.length,
        totalNotes: formattedNotes.reduce(
          (sum, record) => sum + record.totalNotesCount,
          0
        ),
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
  createInvestorNotes,
  getAllPropertiesWithNotes,
  getPropertyWithNotes,
};
