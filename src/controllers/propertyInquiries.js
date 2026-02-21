const {
  Property,
  PropertyInquiry,
  User,
  Role,
  SalesRelationship,
  PropertyNotificationEvent,
} = require("../models");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");
const { getIO } = require("../config/socket");
const { Op } = require("sequelize");

// ============================================
// 1) CREATE/UPDATE INQUIRIES - Push inquiries to array
// ============================================

const createPropertyInquiry = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const { inquiries } = req.body;
  const inquirerId = req.user.userId;

  const requestBodyLog = {
    propertyId,
    inquirerId,
    inquiriesCount: inquiries?.length || 0,
  };

  try {
    // Validate inputs
    if (!inquiries || !Array.isArray(inquiries)) {
      throw createAppError("inquiries must be an array", 400);
    }
    if (inquiries.length === 0) {
      throw createAppError("At least one inquiry is required", 400);
    }
    if (inquiries.length > 50) {
      throw createAppError("Maximum 50 inquiries can be added at once", 400);
    }
    if (!inquirerId) {
      throw createAppError("inquirerId is required", 400);
    }

    // Validate each inquiry
    for (let i = 0; i < inquiries.length; i++) {
      const inquiryItem = inquiries[i];
      if (!inquiryItem.question || typeof inquiryItem.question !== "string") {
        throw createAppError(
          `Inquiry ${i}: question field is required and must be a string`,
          400
        );
      }
      if (inquiryItem.question.trim().length === 0) {
        throw createAppError(`Inquiry ${i}: question cannot be empty`, 400);
      }
      if (inquiryItem.question.length > 5000) {
        throw createAppError(
          `Inquiry ${i}: question cannot exceed 5000 characters`,
          400
        );
      }
      if (inquiryItem.createdAt) {
        const date = new Date(inquiryItem.createdAt);
        if (isNaN(date.getTime())) {
          throw createAppError(
            `Inquiry ${i}: invalid createdAt date format`,
            400
          );
        }
      }
    }

    // Verify property exists
    const property = await Property.findOne({
      where: { property_id: propertyId, isActive: true },
      attributes: ["propertyId", "city", "state", "salesId"],
    });
    if (!property) {
      throw createAppError("Property not found", 404);
    }

    const transaction = await sequelize.transaction();
    try {
      let inquiryRecord = await PropertyInquiry.findOne({
        where: { propertyId, inquirerId },
        transaction,
      });

      let isNew = true;
      let addedInquiries = [];
      let autoAssignedTo = null;

      if (inquiryRecord && inquiryRecord.status !== "closed") {
        // UPDATE: Push to existing array
        const inquiriesWithTimestamp = inquiries.map((inq) => ({
          question: inq.question,
          createdAt: inq.createdAt || new Date().toISOString(),
        }));
        PropertyInquiry.pushInquiries(inquiryRecord, inquiriesWithTimestamp);
        await inquiryRecord.save({ transaction });
        addedInquiries = inquiriesWithTimestamp;
        isNew = false;
      } else {
        // CREATE NEW: No record OR closed
        const inquiriesWithTimestamp = inquiries.map((inq) => ({
          question: inq.question,
          createdAt: inq.createdAt || new Date().toISOString(),
        }));
        inquiryRecord = await PropertyInquiry.create(
          {
            propertyId,
            inquirerId,
            inquiries: inquiriesWithTimestamp,
            source: req.body.source || "direct",
            status: "pending",
          },
          { transaction }
        );
        addedInquiries = inquiriesWithTimestamp;

        // If this property already has a Client Dealer assigned to another inquiry,
        // auto-assign the new inquiry to the same dealer
        const existingAssigned = await PropertyInquiry.findOne({
          where: {
            propertyId,
            assignedTo: { [Op.not]: null },
            status: { [Op.notIn]: ["closed"] },
            id: { [Op.ne]: inquiryRecord.id },
          },
          attributes: ["assignedTo"],
          order: [["assignedAt", "DESC"]],
          transaction,
        });

        if (existingAssigned) {
          const dealerActive = await User.findOne({
            where: { userId: existingAssigned.assignedTo, isActive: true },
            include: [
              {
                model: Role,
                as: "roles",
                where: {
                  roleName: "Sales Executive - Client Dealer",
                  isActive: true,
                },
                through: { attributes: [] },
              },
            ],
          });
          if (dealerActive) {
            await inquiryRecord.update(
              {
                assignedTo: existingAssigned.assignedTo,
                assignedAt: new Date(),
                status: "assigned",
              },
              { transaction }
            );
            autoAssignedTo = existingAssigned.assignedTo;
          }
        }
      }

      await transaction.commit();

      // Notify admins + sales manager about the new/updated inquiry
      try {
        const io = getIO();
        const inquirerName = `${req.user.firstName} ${req.user.lastName}`;
        const message = `New inquiry received for property in ${property.city} from ${inquirerName}`;

        const admins = await User.findAll({
          include: [
            {
              model: Role,
              as: "roles",
              where: { roleName: { [Op.in]: ["Admin", "Super Admin"] } },
              through: { attributes: [] },
            },
          ],
          attributes: ["userId"],
          raw: true,
        });
        const adminIds = admins.map((a) => a.userId);

        let salesManagerId = null;
        if (property.salesId) {
          const rel = await SalesRelationship.findOne({
            where: { salesExecutiveId: property.salesId, isActive: true },
          });
          if (rel) salesManagerId = rel.salesManagerId;
        }

        const recipients = new Set([...adminIds, salesManagerId]);
        recipients.delete(null);
        recipients.delete(undefined);

        const timestamp = new Date().toISOString();
        for (const recipientId of recipients) {
          const notif = await PropertyNotificationEvent.create({
            propertyId: property.propertyId,
            userId: recipientId,
            notificationText: message,
          });

          io.to(`user:${recipientId}`).emit("inquiry:received", {
            id: notif.id,
            inquiryId: inquiryRecord.id,
            propertyId: property.propertyId,
            message,
            timestamp,
          });
        }

        // Notify the dealer who was auto-assigned on inquiry creation
        if (autoAssignedTo) {
          const dealerMessage = `You have been auto-assigned to a new inquiry for property in ${property.city}`;
          const dealerNotif = await PropertyNotificationEvent.create({
            propertyId: property.propertyId,
            userId: autoAssignedTo,
            notificationText: dealerMessage,
          });

          io.to(`user:${autoAssignedTo}`).emit("inquiry:assigned", {
            id: dealerNotif.id,
            inquiryId: inquiryRecord.id,
            propertyId: property.propertyId,
            message: dealerMessage,
            timestamp,
          });
        }
      } catch (notifErr) {
        console.error(
          "Notification failed in createPropertyInquiry:",
          notifErr.message
        );
      }

      await logRequest(
        req,
        {
          userId: inquirerId,
          status: isNew ? 201 : 200,
          body: {
            success: true,
            message: isNew ? "New inquiry created" : "Inquiry updated",
            inquiriesAdded: addedInquiries.length,
          },
        },
        requestStartTime,
        requestBodyLog
      );

      return sendEncodedResponse(
        res,
        isNew ? 201 : 200,
        true,
        isNew ? "New inquiry created" : "Inquiry updated successfully",
        {
          inquiryId: inquiryRecord.id,
          inquiriesAdded: addedInquiries.length,
          addedInquiries,
          isNew,
          status: inquiryRecord.status,
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
        error: error.message,
      },
      requestStartTime,
      requestBodyLog
    );
    return next(error);
  }
});

// ============================================
// 2) ASSIGN INQUIRY TO SALES EXECUTIVE
// ============================================

const assignInquiry = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();

  const { assignedTo, propertyId, inquirerId } = req.body;
  const adminId = req.user.userId;

  const requestBodyLog = { propertyId, inquirerId, assignedTo };

  if (!propertyId) {
    throw createAppError("propertyId is required", 400);
  }

  if (!inquirerId) {
    throw createAppError("inquirerId is required", 400);
  }
  const transaction = await sequelize.transaction();
  try {
    const inquiry = await PropertyInquiry.findOne({
      where: { propertyId, inquirerId },
      transaction,
    });

    if (!inquiry) {
      throw createAppError("Inquiry not found", 404);
    }
    if (["closed", "converted"].includes(inquiry.status)) {
      throw createAppError("Cannot assign a closed or converted inquiry", 400);
    }

    if (!assignedTo) {
      throw createAppError("assignedTo is required", 400);
    }

    const assignee = await User.findOne({
      where: { userId: assignedTo, isActive: true },
      include: [
        {
          model: Role,
          as: "roles",
          where: { roleName: "Sales Executive - Client Dealer" },
        },
      ],
    });
    if (!assignee) {
      throw createAppError(
        "Assigned user must be a Sales Executive - Client Dealer",
        400
      );
    }

    const oldAssignedTo = inquiry.assignedTo;
    const isReassign = !!oldAssignedTo && oldAssignedTo !== assignedTo;

    await inquiry.update(
      {
        assignedTo,
        assignedBy: adminId,
        assignedAt: new Date(),
        status: "assigned",
      },
      { transaction }
    );

    // Notifications
    try {
      const io = getIO();
      const city = inquiry.property?.city || "unknown city";
      const timestamp = new Date().toISOString();
      const notificationRecords = [];

      const newMessage = isReassign
        ? `An inquiry for property in ${city} has been reassigned to you`
        : `You have been assigned to a new inquiry for property in ${city}`;

      notificationRecords.push({
        propertyId: inquiry.propertyId,
        userId: assignedTo,
        notificationText: newMessage,
      });
      io.to(`user:${assignedTo}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        message: newMessage,
        timestamp,
      });

      if (isReassign) {
        const oldMessage = `An inquiry for property in ${city} has been reassigned away from you`;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: oldAssignedTo,
          notificationText: oldMessage,
        });
        io.to(`user:${oldAssignedTo}`).emit("inquiry:unassigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: oldMessage,
          timestamp,
        });
      }

      await PropertyNotificationEvent.bulkCreate(notificationRecords, {
        transaction,
      });
    } catch (err) {
      console.error("Notification failed in assignInquiry:", err.message);
    }

    await transaction.commit();

    await logRequest(
      req,
      {
        userId: adminId,
        status: 200,
        body: {
          success: true,
          message: isReassign
            ? "Inquiry reassigned successfully"
            : "Inquiry assigned successfully",
        },
      },
      requestStartTime,
      requestBodyLog
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      isReassign ? "Inquiry reassigned successfully" : "Inquiry assigned successfully",
      {
        inquiryId: inquiry.id,
        assignedTo,
        previousAssignee: oldAssignedTo || null,
        isReassign,
      }
    );
  } catch (error) {
    await transaction.rollback();
    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        error: error.message,
      },
      requestStartTime,
      requestBodyLog
    );
    return next(error);
  }
});

const autoAssignInquiry = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId, inquirerId } = req.body;
  const adminId = req.user.userId;

  const requestBodyLog = {
    propertyId,
    inquirerId,
    operation: "auto-assign",
    triggeredBy: adminId,
  };

  if (!propertyId || !inquirerId) {
    throw createAppError("propertyId and inquirerId are required", 400);
  }

  const transaction = await sequelize.transaction();
  try {
    const inquiry = await PropertyInquiry.findOne({
      where: { propertyId, inquirerId },
      include: [{ model: Property, as: "property" }],
      transaction,
    });

    if (!inquiry) {
      throw createAppError("Inquiry not found", 404);
    }

    // Find all Client Dealers
    const clientDealers = await User.findAll({
      where: { isActive: true },
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          where: {
            roleName: "Sales Executive - Client Dealer",
            isActive: true,
          },
          attributes: [],
        },
      ],
      transaction,
    });

    if (clientDealers.length === 0) {
      throw createAppError("No Active Client Dealers found to assign", 404);
    }

    const dealerIds = clientDealers.map((u) => u.userId);

    // Count active assignments per dealer
    // We count inquiries that are NOT 'closed' or 'converted' maybe?
    // Or just all assignments? Let's stick to simple count for now or all active.
    const assignmentCounts = await PropertyInquiry.findAll({
      where: {
        assignedTo: { [Op.in]: dealerIds },
        status: { [Op.ne]: "closed" }, // Optional: only count active work
      },
      attributes: [
        "assignedTo",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["assignedTo"],
      raw: true,
      transaction,
    });

    const countMap = {};
    assignmentCounts.forEach((row) => {
      countMap[row.assignedTo] = parseInt(row.count);
    });

    // Find min
    const bestDealerId = dealerIds.reduce((minId, id) => {
      const count = countMap[id] || 0;
      const minCount = countMap[minId] || 0;
      return count < minCount ? id : minId;
    }, dealerIds[0]);

    // Assign
    await inquiry.update(
      {
        assignedTo: bestDealerId,
        assignedBy: adminId,
        assignedAt: new Date(),
        status: "assigned",
      },
      { transaction }
    );

    // Notifications
    try {
      const io = getIO();
      const message = `You have been auto-assigned to a new inquiry for property in ${inquiry.property?.city || "unknown city"}`;

      await PropertyNotificationEvent.create(
        {
          propertyId: inquiry.propertyId,
          userId: bestDealerId,
          notificationText: message,
        },
        { transaction }
      );

      io.to(`user:${bestDealerId}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Notification failed in autoAssignInquiry:", err.message);
    }

    await transaction.commit();

    await logRequest(
      req,
      {
        userId: adminId,
        status: 200,
        body: {
          success: true,
          message: "Inquiry auto-assigned successfully",
          assignedTo: bestDealerId,
        },
      },
      requestStartTime,
      requestBodyLog
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Inquiry auto-assigned successfully",
      {
        inquiryId: inquiry.id,
        assignedTo: bestDealerId,
      }
    );
  } catch (error) {
    await transaction.rollback();
    await logRequest(
      req,
      {
        userId: req.user?.userId || null,
        status: error.statusCode || 500,
        body: { success: false, message: error.message },
        error: error.message,
      },
      requestStartTime,
      requestBodyLog
    );
    return next(error);
  }
});

// ============================================
// 3) GET PENDING INQUIRIES (Admin Dashboard)
// ============================================

const getPendingInquiries = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, priority } = req.query;
  const pageNumber = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNumber - 1) * pageSize;

  const whereClause = {
    status: "pending",
    ...(priority && { priority }),
  };

  const { count, rows } = await PropertyInquiry.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Property,
        as: "property",
        attributes: ["propertyId", "city", "state"],
        required: true,
      },
      {
        model: User,
        as: "inquirer",
        attributes: ["user_id", "firstName", "lastName", "email"],
        required: true,
      },
    ],
    order: [
      ["priority", "DESC"],
      ["created_at", "ASC"],
    ],
    limit: pageSize,
    offset,
  });

  return sendEncodedResponse(
    res,
    200,
    true,
    "Pending inquiries fetched",
    rows,
    {
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalItems: count,
        totalPages: Math.ceil(count / pageSize),
      },
    }
  );
});

// ============================================
// 4) GET ASSIGNED INQUIRIES (Sales Executive Dashboard)
// ============================================

const getAssignedInquiries = asyncHandler(async (req, res) => {
  const salesExecId = req.user.userId;
  const { status } = req.query;

  const whereClause = {
    assignedTo: salesExecId,
    ...(status && { status }),
  };

  const inquiries = await PropertyInquiry.findAll({
    where: whereClause,
    include: [
      { model: Property, as: "property" },
      { model: User, as: "inquirer" },
    ],
    order: [
      ["priority", "DESC"],
      ["assigned_at", "ASC"],
    ],
  });

  return sendEncodedResponse(
    res,
    200,
    true,
    "Assigned inquiries fetched",
    inquiries
  );
});

module.exports = {
  createPropertyInquiry,
  assignInquiry,
  autoAssignInquiry,
  getPendingInquiries,
  getAssignedInquiries,
};
