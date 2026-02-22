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

        // If this CLIENT (inquirerId) already has a dealer assigned on any other
        // inquiry (across any property), auto-assign this new inquiry to the same dealer
        const existingAssigned = await PropertyInquiry.findOne({
          where: {
            inquirerId,                          // ← same CLIENT, not same property
            assignedTo: { [Op.not]: null },
            status: { [Op.notIn]: ["closed"] },
            id: { [Op.ne]: inquiryRecord.id },
          },
          attributes: ["assignedTo"],
          order: [["assignedAt", "DESC"]],
          transaction,
        });

        if (existingAssigned) {
          // Verify the previously assigned user is still active
          const assigneeActive = await User.findOne({
            where: { userId: existingAssigned.assignedTo, isActive: true },
          });
          if (assigneeActive) {
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
          const dealerMessage = `A new inquiry for property in ${property.city} has been auto-assigned to you by the system.`;
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
            assignedBy: "system",
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

    // Assignable roles per assigner hierarchy:
    //   Super Admin  → anyone (Admin, Super Admin, Sales Manager, any Sales Executive)
    //   Admin        → Admin, Sales Manager, any Sales Executive
    //   Sales Manager → Sales Executives only
    const assignerRole = req.userRole;

    let ASSIGNABLE_ROLES;
    if (assignerRole === "Super Admin") {
      ASSIGNABLE_ROLES = [
        "Admin",
        "Super Admin",
        "Sales Manager",
        "Sales Executive - Property Manager",
        "Sales Executive - Client Dealer",
      ];
    } else if (assignerRole === "Admin") {
      ASSIGNABLE_ROLES = [
        "Admin",
        "Sales Manager",
        "Sales Executive - Property Manager",
        "Sales Executive - Client Dealer",
      ];
    } else {
      // Sales Manager
      ASSIGNABLE_ROLES = [
        "Sales Executive - Property Manager",
        "Sales Executive - Client Dealer",
      ];
    }

    const assignee = await User.findOne({
      where: { userId: assignedTo, isActive: true },
      include: [
        {
          model: Role,
          as: "roles",
          where: { roleName: { [Op.in]: ASSIGNABLE_ROLES }, isActive: true },
          through: { attributes: [] },
        },
      ],
    });
    if (!assignee) {
      throw createAppError(
        `Assigned user not found, inactive, or cannot be assigned by a ${assignerRole}. Allowed targets: ${ASSIGNABLE_ROLES.join(", ")}`,
        400
      );
    }

    const oldAssignedTo = inquiry.assignedTo;
    const isReassign = !!oldAssignedTo && oldAssignedTo !== assignedTo;

    // Fetch property city (not loaded on inquiry)
    const inquiryProperty = await Property.findOne({
      where: { propertyId: inquiry.propertyId },
      attributes: ["city"],
    });
    const city = inquiryProperty?.city || "unknown city";

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
      const timestamp = new Date().toISOString();
      const assignerName = `${req.user.firstName} ${req.user.lastName}`;
      const newAssigneeName = `${assignee.firstName} ${assignee.lastName}`;
      const notificationRecords = [];

      // Fetch old assignee name if reassigning
      let oldAssigneeName = null;
      if (isReassign && oldAssignedTo) {
        const oldAssignee = await User.findByPk(oldAssignedTo, { attributes: ["firstName", "lastName"] });
        if (oldAssignee) oldAssigneeName = `${oldAssignee.firstName} ${oldAssignee.lastName}`;
      }

      // Fetch admins & super admins
      const adminUsers = await User.findAll({
        include: [{
          model: Role,
          as: "roles",
          where: { roleName: { [Op.in]: ["Admin", "Super Admin"] }, isActive: true },
          through: { attributes: [] },
        }],
        attributes: ["userId"],
        raw: true,
      });
      const adminIds = adminUsers.map((a) => a.userId);

      // Fetch sales manager of assigned dealer (via property's sales executive)
      let salesManagerId = null;
      const propForSM = await Property.findOne({
        where: { propertyId: inquiry.propertyId },
        attributes: ["salesId"],
      });
      if (propForSM?.salesId) {
        const smRel = await SalesRelationship.findOne({
          where: { salesExecutiveId: propForSM.salesId, isActive: true },
        });
        if (smRel) salesManagerId = smRel.salesManagerId;
      }

      // Notify new assignee
      const newMessage = isReassign
        ? `An inquiry for property in ${city} has been reassigned to you by ${assignerName}.`
        : `A new inquiry for property in ${city} has been assigned to you by ${assignerName}.`;
      notificationRecords.push({ propertyId: inquiry.propertyId, userId: assignedTo, notificationText: newMessage });
      io.to(`user:${assignedTo}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id, propertyId: inquiry.propertyId,
        message: newMessage, assignedBy: adminId, assignedByName: assignerName, timestamp,
      });

      // Notify old assignee
      if (isReassign && oldAssignedTo) {
        const oldMessage = `An inquiry for property in ${city} has been reassigned to ${newAssigneeName} by ${assignerName}.`;
        notificationRecords.push({ propertyId: inquiry.propertyId, userId: oldAssignedTo, notificationText: oldMessage });
        io.to(`user:${oldAssignedTo}`).emit("inquiry:unassigned", {
          inquiryId: inquiry.id, propertyId: inquiry.propertyId,
          message: oldMessage, reassignedBy: adminId, reassignedByName: assignerName,
          reassignedTo: assignedTo, reassignedToName: newAssigneeName, timestamp,
        });
      }

      // Notify admins & super admins
      const adminMessage = isReassign
        ? `Inquiry for property in ${city} has been reassigned from ${oldAssigneeName || "unassigned"} to ${newAssigneeName} by ${assignerName}.`
        : `A new inquiry for property in ${city} has been assigned to ${newAssigneeName} by ${assignerName}.`;
      for (const aId of adminIds) {
        if (aId === adminId) continue; // skip if assigner is admin
        notificationRecords.push({ propertyId: inquiry.propertyId, userId: aId, notificationText: adminMessage });
        io.to(`user:${aId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id, propertyId: inquiry.propertyId,
          message: adminMessage, assignedTo, assignedToName: newAssigneeName,
          assignedBy: adminId, assignedByName: assignerName, timestamp,
        });
      }

      // Notify sales manager
      if (salesManagerId && salesManagerId !== adminId && !adminIds.includes(salesManagerId)) {
        const smMessage = isReassign
          ? `Inquiry for property in ${city} has been reassigned from ${oldAssigneeName || "unassigned"} to ${newAssigneeName} by ${assignerName}.`
          : `A new inquiry for property in ${city} has been assigned to ${newAssigneeName} by ${assignerName}.`;
        notificationRecords.push({ propertyId: inquiry.propertyId, userId: salesManagerId, notificationText: smMessage });
        io.to(`user:${salesManagerId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id, propertyId: inquiry.propertyId,
          message: smMessage, assignedTo, assignedToName: newAssigneeName,
          assignedBy: adminId, assignedByName: assignerName, timestamp,
        });
      }

      await PropertyNotificationEvent.bulkCreate(notificationRecords, { transaction });
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

    // Find all users with roles eligible for auto-assignment
    // (Sales Executive - Client Dealer and Sales Manager)
    const AUTO_ASSIGN_ROLES = [
      "Sales Executive - Client Dealer",
      "Sales Manager",
    ];

    const clientDealers = await User.findAll({
      where: { isActive: true },
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          where: {
            roleName: { [Op.in]: AUTO_ASSIGN_ROLES },
            isActive: true,
          },
          attributes: [],
        },
      ],
      transaction,
    });

    if (clientDealers.length === 0) {
      throw createAppError("No active assignable users (Sales Manager / Client Dealer) found", 404);
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
      const adminName = `${req.user.firstName} ${req.user.lastName}`;
      const inquiryCity = inquiry.property?.city || "unknown city";
      const timestamp = new Date().toISOString();
      const notificationRecords = [];

      // Fetch best dealer name
      const bestDealer = await User.findByPk(bestDealerId, { attributes: ["firstName", "lastName"] });
      const bestDealerName = bestDealer ? `${bestDealer.firstName} ${bestDealer.lastName}` : "a Sales Executive";

      // Fetch admins & super admins
      const adminUsers = await User.findAll({
        include: [{
          model: Role,
          as: "roles",
          where: { roleName: { [Op.in]: ["Admin", "Super Admin"] }, isActive: true },
          through: { attributes: [] },
        }],
        attributes: ["userId"],
        raw: true,
      });
      const adminIds = adminUsers.map((a) => a.userId);

      // Fetch sales manager via property's sales executive
      let salesManagerId = null;
      if (inquiry.property?.salesId) {
        const smRel = await SalesRelationship.findOne({
          where: { salesExecutiveId: inquiry.property.salesId, isActive: true },
        });
        if (smRel) salesManagerId = smRel.salesManagerId;
      }

      // Notify dealer (new assignee)
      const dealerMessage = `A new inquiry for property in ${inquiryCity} has been auto-assigned to you by ${adminName}.`;
      notificationRecords.push({ propertyId: inquiry.propertyId, userId: bestDealerId, notificationText: dealerMessage });
      io.to(`user:${bestDealerId}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id, propertyId: inquiry.propertyId,
        message: dealerMessage, assignedBy: adminId, assignedByName: adminName, timestamp,
      });

      // Notify admins & super admins
      const adminMessage = `An inquiry for property in ${inquiryCity} has been auto-assigned to ${bestDealerName} by ${adminName}.`;
      for (const aId of adminIds) {
        if (aId === adminId) continue;
        notificationRecords.push({ propertyId: inquiry.propertyId, userId: aId, notificationText: adminMessage });
        io.to(`user:${aId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id, propertyId: inquiry.propertyId,
          message: adminMessage, assignedTo: bestDealerId, assignedToName: bestDealerName,
          assignedBy: adminId, assignedByName: adminName, timestamp,
        });
      }

      // Notify sales manager
      if (salesManagerId && salesManagerId !== adminId && !adminIds.includes(salesManagerId)) {
        const smMessage = `An inquiry for property in ${inquiryCity} has been auto-assigned to ${bestDealerName} by ${adminName}.`;
        notificationRecords.push({ propertyId: inquiry.propertyId, userId: salesManagerId, notificationText: smMessage });
        io.to(`user:${salesManagerId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id, propertyId: inquiry.propertyId,
          message: smMessage, assignedTo: bestDealerId, assignedToName: bestDealerName,
          assignedBy: adminId, assignedByName: adminName, timestamp,
        });
      }

      await PropertyNotificationEvent.bulkCreate(notificationRecords, { transaction });
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
// const purgeAllNotifications = asyncHandler(async (req, res) => {
//   try {
//     const deletedCount = await PropertyNotificationEvent.destroy({});
//     console.log("deleted")
//     return sendEncodedResponse(res, 200, true, "All notifications permanently removed", { deletedCount });
//   }
//   catch (error) { }
// });

module.exports = {
  createPropertyInquiry,
  assignInquiry,
  autoAssignInquiry,
  getPendingInquiries,
  getAssignedInquiries,
};
