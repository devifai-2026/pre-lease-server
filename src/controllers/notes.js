const {
  Property,
  PropertyManagerNotes,
  User,
  Role,
  PropertyMedia,
  PropertyNotificationEvent,
  SalesRelationship,
} = require("../models");
const { Op } = require("sequelize");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { attachSignedUrls } = require("../utils/gcsHelper");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { getIO } = require("../config/socket");

// ============================================
// HELPERS: user ID lookups for notifications
// ============================================

/** Admin + Super Admin */
const getAdminUserIds = async () => {
  const users = await User.findAll({
    where: { isActive: true },
    attributes: ["userId"],
    include: [
      {
        model: Role,
        as: "roles",
        where: { roleName: { [Op.in]: ["Admin", "Super Admin"] }, isActive: true },
        required: true,
        through: { attributes: [] },
        attributes: [],
      },
    ],
  });
  return users.map((u) => u.userId);
};

/** Admin + Super Admin + Sales Manager */
const getAdminAndManagerUserIds = async () => {
  const users = await User.findAll({
    where: { isActive: true },
    attributes: ["userId"],
    include: [
      {
        model: Role,
        as: "roles",
        where: {
          roleName: { [Op.in]: ["Admin", "Super Admin", "Sales Manager"] },
          isActive: true,
        },
        required: true,
        through: { attributes: [] },
        attributes: [],
      },
    ],
  });
  return users.map((u) => u.userId);
};

// ============================================
// 1) CREATE NOTES — Sales Executive / Admin
// ============================================

/**
 * Sales Executive creates a note → status = 'pending' (needs admin approval).
 * Admin / Super Admin / Sales Manager create a note → status = 'approved'.
 * Only the sales exec assigned to the property (property.salesId) can create notes,
 * unless the caller is Admin / Super Admin / Sales Manager.
 */
const createPropertyManagerNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { notes } = req.body;
  const salesExecutiveId = req.user.userId;

  const requestBodyLog = { propertyId };

  try {
    if (!notes || typeof notes !== "string" || notes.trim().length === 0) {
      throw createAppError("notes must be a non-empty string", 400);
    }

    if (notes.trim().length > 5000) {
      throw createAppError("notes cannot exceed 5000 characters", 400);
    }

    const isAdminOrManager = ["Admin", "Super Admin", "Sales Manager"].includes(
      req.user.role
    );

    const where = { propertyId, isActive: true };
    if (!isAdminOrManager) {
      where.salesId = salesExecutiveId;
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

    // Sales exec notes go 'pending'; admin / manager notes are auto-approved
    const noteStatus = isAdminOrManager ? "approved" : "pending";

    const transaction = await sequelize.transaction();

    try {
      let noteRecord = await PropertyManagerNotes.findOne({
        where: { propertyId, salesExecutiveId },
        transaction,
      });

      let isNew = false;

      if (!noteRecord) {
        noteRecord = await PropertyManagerNotes.create(
          {
            propertyId,
            salesExecutiveId,
            notes: notes.trim(),
            totalNotesCount: 1,
            status: noteStatus,
            isActive: true,
            createdBy: salesExecutiveId,
            updatedBy: salesExecutiveId,
          },
          { transaction }
        );
        isNew = true;
      } else {
        noteRecord.notes = notes.trim();
        noteRecord.status = noteStatus; // reset to pending if exec re-submits
        noteRecord.isEdited = false;
        noteRecord.editedNote = null;
        noteRecord.updatedBy = salesExecutiveId;
        noteRecord.totalNotesCount += 1;
        await noteRecord.save({ transaction });
        isNew = false;
      }

      await transaction.commit();

      // ── Socket: notify Admin + Super Admin + Sales Manager about the pending note
      if (!isAdminOrManager) {
        try {
          const io = getIO();
          const salesExecName = `${req.user.firstName} ${req.user.lastName}`;
          const message = `${salesExecName} added a note to a property in ${property.city} — pending your approval`;
          const recipientIds = await getAdminAndManagerUserIds();
          const timestamp = new Date().toISOString();

          if (recipientIds.length > 0) {
            const notificationRecords = recipientIds.map((uid) => ({
              propertyId: property.propertyId,
              userId: uid,
              notificationText: message,
            }));
            await PropertyNotificationEvent.bulkCreate(notificationRecords);

            recipientIds.forEach((uid) => {
              io.to(`user:${uid}`).emit("property:note_pending_approval", {
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
              : "Notes updated successfully",
          },
          requestBodyLog,
        },
        requestStartTime
      );

      return sendEncodedResponse(
        res,
        isNew ? 201 : 200,
        true,
        isNew ? "Notes created successfully" : "Notes updated successfully",
        {
          notes: PropertyManagerNotes.getEffectiveNote(noteRecord),
          status: noteRecord.status,
          isEdited: noteRecord.isEdited,
          totalNotesCount: noteRecord.totalNotesCount,
          isNew,
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
// 2) APPROVE / DENY / EDIT NOTE — Admin / Super Admin only
// ============================================

/**
 * Admin or Super Admin can:
 *  - Approve a pending note                          (action = 'approve')
 *  - Approve + edit the note text before publishing  (action = 'approve', editedNote provided)
 *  - Deny a pending note                             (action = 'deny')
 *
 * Socket events:
 *  - approve → notifies the sales exec + property owner
 *  - deny    → notifies the sales exec only
 */
const approveOrEditNote = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { salesExecutiveId, action, editedNote } = req.body;
  const adminId = req.user.userId;

  const requestBodyLog = { propertyId, salesExecutiveId, action };

  try {
    if (!salesExecutiveId) {
      throw createAppError("salesExecutiveId is required", 400);
    }

    if (!["approve", "deny"].includes(action)) {
      throw createAppError("action must be 'approve' or 'deny'", 400);
    }

    if (action === "approve" && editedNote !== undefined) {
      if (typeof editedNote !== "string" || !editedNote.trim()) {
        throw createAppError("editedNote must be a non-empty string", 400);
      }
      if (editedNote.trim().length > 5000) {
        throw createAppError("editedNote cannot exceed 5000 characters", 400);
      }
    }

    const property = await Property.findOne({
      where: { propertyId, isActive: true },
      attributes: ["propertyId", "ownerId", "city", "state"],
    });

    if (!property) {
      throw createAppError("Property not found", 404);
    }

    const transaction = await sequelize.transaction();

    try {
      const noteRecord = await PropertyManagerNotes.findOne({
        where: { propertyId, salesExecutiveId },
        transaction,
      });

      if (!noteRecord) {
        await transaction.rollback();
        throw createAppError("Note not found", 404);
      }

      if (noteRecord.status === "approved") {
        await transaction.rollback();
        throw createAppError("This note is already approved", 400);
      }

      if (action === "approve") {
        noteRecord.status = "approved";
        noteRecord.approvedBy = adminId;
        noteRecord.updatedBy = adminId;

        if (editedNote) {
          noteRecord.editedNote = editedNote.trim();
          noteRecord.isEdited = true;
          noteRecord.editedBy = adminId;
        }
      } else {
        // deny
        noteRecord.status = "denied";
        noteRecord.updatedBy = adminId;
      }

      await noteRecord.save({ transaction });
      await transaction.commit();

      // ── Socket notifications
      try {
        const io = getIO();
        const adminName = `${req.user.firstName} ${req.user.lastName}`;
        const timestamp = new Date().toISOString();

        if (action === "approve") {
          const wasEdited = noteRecord.isEdited;
          const execMessage = wasEdited
            ? `Your note has been edited and approved by ${adminName}`
            : `Your note has been approved by ${adminName}`;
          const adminBroadcastMessage = wasEdited
            ? `${adminName} edited and approved a sales executive note for a property in ${property.city}`
            : `${adminName} approved a sales executive note for a property in ${property.city}`;

          // ── Notify the sales executive (DB + socket)
          await PropertyNotificationEvent.create({
            propertyId,
            userId: salesExecutiveId,
            notificationText: execMessage,
          });
          io.to(`user:${salesExecutiveId}`).emit("property:note_approved", {
            propertyId,
            message: execMessage,
            approvedBy: adminId,
            isEdited: wasEdited,
            timestamp,
          });

          // ── Notify property owner (DB + socket)
          if (property.ownerId) {
            const ownerMessage = `A note from your property manager has been approved for your property in ${property.city}`;
            await PropertyNotificationEvent.create({
              propertyId,
              userId: property.ownerId,
              notificationText: ownerMessage,
            });
            io.to(`user:${property.ownerId}`).emit("property:note_approved", {
              propertyId,
              message: ownerMessage,
              approvedBy: adminId,
              timestamp,
            });
          }

          // ── Notify all other Admin + Super Admin (DB + socket)
          const adminIds = await getAdminUserIds();
          const otherAdminIds = adminIds.filter((uid) => uid !== adminId);
          if (otherAdminIds.length > 0) {
            await PropertyNotificationEvent.bulkCreate(
              otherAdminIds.map((uid) => ({
                propertyId,
                userId: uid,
                notificationText: adminBroadcastMessage,
              }))
            );
            otherAdminIds.forEach((uid) => {
              io.to(`user:${uid}`).emit("property:note_approved", {
                propertyId,
                message: adminBroadcastMessage,
                approvedBy: adminId,
                isEdited: wasEdited,
                timestamp,
              });
            });
          }
        } else {
          // ── deny — notify sales exec + other Admin + Super Admin (DB + socket)
          const denyMessage = `Your note has been denied by ${adminName}`;
          await PropertyNotificationEvent.create({
            propertyId,
            userId: salesExecutiveId,
            notificationText: denyMessage,
          });
          io.to(`user:${salesExecutiveId}`).emit("property:note_denied", {
            propertyId,
            message: denyMessage,
            deniedBy: adminId,
            timestamp,
          });

          const adminBroadcastMessage = `${adminName} denied a sales executive note for a property in ${property.city}`;
          const adminIds = await getAdminUserIds();
          const otherAdminIds = adminIds.filter((uid) => uid !== adminId);
          if (otherAdminIds.length > 0) {
            await PropertyNotificationEvent.bulkCreate(
              otherAdminIds.map((uid) => ({
                propertyId,
                userId: uid,
                notificationText: adminBroadcastMessage,
              }))
            );
            otherAdminIds.forEach((uid) => {
              io.to(`user:${uid}`).emit("property:note_denied", {
                propertyId,
                message: adminBroadcastMessage,
                deniedBy: adminId,
                timestamp,
              });
            });
          }
        }
      } catch (notifErr) {
        console.error(
          "Notification failed in approveOrEditNote:",
          notifErr.message
        );
      }

      await logRequest(
        req,
        {
          userId: adminId,
          status: 200,
          body: {
            success: true,
            message:
              action === "approve"
                ? "Note approved successfully"
                : "Note denied successfully",
          },
          requestBodyLog,
        },
        requestStartTime
      );

      return sendEncodedResponse(
        res,
        200,
        true,
        action === "approve" ? "Note approved successfully" : "Note denied successfully",
        {
          status: noteRecord.status,
          originalNote: noteRecord.notes,
          adminNote: noteRecord.isEdited ? noteRecord.editedNote : null,
          isEdited: noteRecord.isEdited,
          approvedBy: noteRecord.approvedBy,
          updatedBy: noteRecord.updatedBy,
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
// 3) GET ALL PROPERTIES WITH NOTES (Sales Agent Filter)
// ============================================

/**
 * Get all properties with property manager notes assigned to logged-in sales agent
 * Only shows properties where sales_id matches logged-in user (Sales Manager or Sales Executive)
 */
const getAllPropertiesWithNotes = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const salesExecutiveId = req.user.userId;
  const {
    page = 1,
    limit = 10,
    sortBy = "updatedAt",
    sortOrder = "DESC",
  } = req.query;

  const requestBodyLog = {
    salesExecutiveId,
    page,
    limit,
    sortBy,
    sortOrder,
  };

  try {
    const userRole = req.userRole || req.user.role;

    const noteWhereClause = { isActive: true };

    if (["Admin", "Super Admin"].includes(userRole)) {
      // See all notes
    } else if (userRole === "Sales Manager") {
      const relationships = await SalesRelationship.findAll({
        where: { salesManagerId: salesExecutiveId, isActive: true },
        attributes: ["salesExecutiveId"],
        raw: true,
      });
      const teamIds = relationships.map((r) => r.salesExecutiveId);
      teamIds.push(salesExecutiveId);
      noteWhereClause.salesExecutiveId = { [Op.in]: teamIds };
    } else {
      noteWhereClause.salesExecutiveId = salesExecutiveId;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const offset = (pageNumber - 1) * pageSize;

    const { count, rows: noteRecords } =
      await PropertyManagerNotes.findAndCountAll({
        where: noteWhereClause,
        include: [
          {
            model: Property,
            as: "property",
            required: true,
            where: { isActive: true },
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

        // Log-style: expose original note and admin's edit separately
        recordData.originalNote = record.notes;
        recordData.adminNote = record.isEdited ? record.editedNote : null;
        recordData.isEdited = record.isEdited;
        delete recordData.notes;
        delete recordData.editedNote;

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
          salesExecutiveId: salesExecutiveId,
          role: req.user.roles,
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
// 4) GET SPECIFIC PROPERTY WITH NOTES (Sales Agent Filter)
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
    const userRole = req.userRole || req.user.role;
    const isAdminOrManager = ["Admin", "Super Admin", "Sales Manager"].includes(
      userRole
    );

    const where = { propertyId, isActive: true };
    if (!isAdminOrManager) {
      where.salesId = salesExecutiveId;
    }

    const notesWhere = { isActive: true };
    if (["Admin", "Super Admin"].includes(userRole)) {
      // No filter
    } else if (userRole === "Sales Manager") {
      const relationships = await SalesRelationship.findAll({
        where: { salesManagerId: salesExecutiveId, isActive: true },
        attributes: ["salesExecutiveId"],
        raw: true,
      });
      const teamIds = relationships.map((r) => r.salesExecutiveId);
      teamIds.push(salesExecutiveId);
      notesWhere.salesExecutiveId = { [Op.in]: teamIds };
    } else {
      notesWhere.salesExecutiveId = salesExecutiveId;
    }

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
        {
          model: PropertyManagerNotes,
          as: "managerNotes",
          where: notesWhere,
          required: false,
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

    const propertyData = property.toJSON();
    if (propertyData.media && propertyData.media.length > 0) {
      propertyData.media = await attachSignedUrls(propertyData.media);
    }

    let formattedNotes = [];
    let totalNotes = 0;

    if (propertyData.managerNotes && propertyData.managerNotes.length > 0) {
      formattedNotes = propertyData.managerNotes.map((record) => {
        // Log-style: both the original and admin's edit are visible
        const formatted = { ...record };
        formatted.originalNote = record.notes;
        formatted.adminNote = record.isEdited ? record.editedNote : null;
        delete formatted.notes;
        delete formatted.editedNote;
        return formatted;
      });
      totalNotes = formattedNotes.length;
    }

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
// 5) GET PROPERTY NOTES — Owner Dashboard
// ============================================

/**
 * Owner can view all approved notes on their property.
 */
const getPropertyNotesByOwner = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const ownerId = req.user.userId;

  const requestBodyLog = { propertyId, ownerId };

  try {
    const property = await Property.findOne({
      where: { propertyId, ownerId, isActive: true },
      attributes: [
        "propertyId",
        "propertyType",
        "city",
        "state",
        "microMarket",
      ],
      include: [
        {
          model: PropertyManagerNotes,
          as: "managerNotes",
          where: { isActive: true, status: "approved" },
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
        const formatted = { ...record };
        formatted.originalNote = record.notes;
        formatted.adminNote = record.isEdited ? record.editedNote : null;
        delete formatted.notes;
        delete formatted.editedNote;
        return formatted;
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

    return sendEncodedResponse(
      res,
      200,
      true,
      "Notes fetched successfully",
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

/**
 * Owner can view all approved notes for all their properties in one list.
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
          where: { isActive: true, status: "approved" },
          required: true,
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

    const allNotes = [];
    properties.forEach((prop) => {
      const propData = prop.toJSON();
      if (propData.managerNotes) {
        propData.managerNotes.forEach((record) => {
          allNotes.push({
            originalNote: record.notes,
            adminNote: record.isEdited ? record.editedNote : null,
            isEdited: record.isEdited,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            propertyId: propData.propertyId,
            microMarket: propData.microMarket,
            location: `${propData.city}, ${propData.state}`,
            addedBy: record.salesExecutive
              ? `${record.salesExecutive.firstName} ${record.salesExecutive.lastName}`
              : "System",
          });
        });

        allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }
    });

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

// ============================================
// 6) OWNER ADDS NOTE — directly approved, notifies admins
// ============================================

/**
 * Owner can add notes to their own property until it is completely verified.
 * Owner notes are published directly (no approval needed).
 * Admins / Super Admins are notified via socket.
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
      attributes: ["propertyId", "isVerified", "city", "state", "salesId"],
    });

    if (!property) {
      throw createAppError("Property not found or you don't have access", 404);
    }

    if (property.isVerified === "completed") {
      throw createAppError(
        "Cannot add notes to a property that is fully verified",
        403
      );
    }

    const transaction = await sequelize.transaction();

    try {
      let noteRecord = await PropertyManagerNotes.findOne({
        where: { propertyId, salesExecutiveId: ownerId },
        transaction,
      });

      let isNew = false;

      if (!noteRecord) {
        noteRecord = await PropertyManagerNotes.create(
          {
            propertyId,
            salesExecutiveId: ownerId,
            notes: noteText,
            totalNotesCount: 1,
            status: "approved", // owner notes are always approved
            isActive: true,
            createdBy: ownerId,
            updatedBy: ownerId,
          },
          { transaction }
        );
        isNew = true;
      } else {
        PropertyManagerNotes.markAsEdited(noteRecord, noteText, ownerId);
        noteRecord.status = "approved";
        noteRecord.totalNotesCount += 1;
        await noteRecord.save({ transaction });
      }

      await transaction.commit();

      // ── Socket: notify Sales Exec + Admin + Super Admin + Sales Manager
      try {
        const io = getIO();
        const ownerName = `${req.user.firstName} ${req.user.lastName}`;
        const message = `Property owner ${ownerName} added a note to their property in ${property.city}`;
        const timestamp = new Date().toISOString();

        // Admin + Super Admin + Sales Manager
        const adminAndManagerIds = await getAdminAndManagerUserIds();

        // Collect all unique recipient IDs (admin/managers + assigned sales exec)
        const recipientSet = new Set(adminAndManagerIds);
        if (property.salesId && property.salesId !== ownerId) {
          recipientSet.add(property.salesId);
        }
        const recipientIds = [...recipientSet];

        if (recipientIds.length > 0) {
          await PropertyNotificationEvent.bulkCreate(
            recipientIds.map((uid) => ({
              propertyId,
              userId: uid,
              notificationText: message,
            }))
          );

          recipientIds.forEach((uid) => {
            io.to(`user:${uid}`).emit("property:owner_note_added", {
              propertyId,
              message,
              addedBy: ownerId,
              timestamp,
            });
          });
        }
      } catch (notifErr) {
        console.error(
          "Notification failed in addOwnerNoteForProperty:",
          notifErr.message
        );
      }

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

      return sendEncodedResponse(res, 201, true, "Note added successfully", {
        note: noteText,
        isEdited: !isNew,
      });
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
  approveOrEditNote,
  getAllPropertiesWithNotes,
  getPropertyWithNotes,
  getPropertyNotesByOwner,
  getAllOwnerNotes,
  addOwnerNoteForProperty,
};
