const {
  Property,
  PropertyInquiry,
  User,
  Role,
  BrokerProfile,
  SalesRelationship,
  PropertyNotificationEvent,
  PropertyMedia,
  InquiryStage,
  InquiryStatusHistory,
  InquiryMessage,
} = require("../models");
const { autoAssignRole, clearGuestFlag } = require("../utils/roleHelper");
const {
  getDefaultStage,
  pickLeastLoadedDealer,
  findStickyDealer,
} = require("../utils/inquiryAssignment");
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
  const { inquiry, source, priority, inquirerRoleType = "investor" } = req.body;
  const inquirerId = req.user.userId;

  const requestBodyLog = {
    propertyId,
    inquirerId,
    source,
    inquirerRoleType,
  };

  try {
    // Validate inputs
    if (!inquiry || typeof inquiry !== "string") {
      throw createAppError("inquiry is required and must be a string", 400);
    }
    if (inquiry.trim().length === 0) {
      throw createAppError("inquiry cannot be empty", 400);
    }
    if (!inquirerId) {
      throw createAppError("inquirerId is required", 400);
    }

    if (!["investor", "broker"].includes(inquirerRoleType)) {
      throw createAppError('inquirerRoleType must be "investor" or "broker"', 400);
    }

    // ── Broker check: must have Broker role AND broker profile ────────────────
    if (inquirerRoleType === "broker") {
      const hasBrokerRole = req.user.roles.some((r) => r.roleName === "Broker");
      if (!hasBrokerRole) {
        throw createAppError(
          "You must have a broker profile to submit an inquiry as a broker",
          403
        );
      }
      const brokerProfile = await BrokerProfile.findOne({ where: { userId: inquirerId } });
      if (!brokerProfile) {
        throw createAppError(
          "Complete your broker profile before submitting an inquiry as a broker",
          403
        );
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
      let autoAssignedTo = null;

      // ── Auto-assign Investor role if acting as investor ───────────────────
      if (inquirerRoleType === "investor") {
        await autoAssignRole(inquirerId, "Investor", "first_inquiry", transaction);
        if (req.user.isGuest) {
          await clearGuestFlag(inquirerId, transaction);
        }
      }

      // Every new enquiry starts at the default "New" stage.
      const defaultStage = await getDefaultStage(transaction);

      // Always create a new row
      const inquiryRecord = await PropertyInquiry.create(
        {
          propertyId,
          inquirerId,
          inquiry: inquiry.trim(),
          source: source || "direct",
          priority: priority || "medium",
          inquirerRoleType,
          stageId: defaultStage ? defaultStage.id : null,
        },
        { transaction }
      );

      // Record the initial "New" stage in the enquiry timeline.
      if (defaultStage) {
        await InquiryStatusHistory.create(
          {
            inquiryId: inquiryRecord.id,
            stageId: defaultStage.id,
            stageName: defaultStage.name,
            note: "Enquiry created",
            changedBy: inquirerId,
          },
          { transaction }
        );
      }

      // Sticky routing: keep this CLIENT (inquirerId) with the SAME Client Dealer
      // they were FIRST assigned — across any property, broker or investor — so
      // that dealer builds up context on the client. Later admin reassignments
      // are ignored: we always anchor on the first-ever dealer. If that dealer is
      // now inactive or no longer a Client Dealer, fall through to load balancing.
      const stickyDealerId = await findStickyDealer(
        inquirerId,
        inquiryRecord.id,
        transaction
      );

      if (stickyDealerId) {
        await inquiryRecord.update(
          {
            assignedTo: stickyDealerId,
            assignedAt: new Date(),
          },
          { transaction }
        );
        autoAssignedTo = stickyDealerId;
      }

      // First-time client (or prior dealer gone): load-balance to the
      // least-loaded active Client Dealer so every new enquiry gets an owner.
      if (!autoAssignedTo) {
        const balancedDealerId = await pickLeastLoadedDealer(transaction);
        if (balancedDealerId) {
          await inquiryRecord.update(
            {
              assignedTo: balancedDealerId,
              assignedBy: inquirerId,
              assignedAt: new Date(),
            },
            { transaction }
          );
          autoAssignedTo = balancedDealerId;
        }
        // If no active Client Dealer exists → leave unassigned for manual handling.
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
            title: "New Inquiry",
            notificationText: message,
          });

          io.to(`user:${recipientId}`).emit("inquiry:received", {
        propertyId: property.propertyId,
        id: notif.id,
        title: "New Inquiry",
        message: `A new inquiry has been received for property in ${property.city}`,
        propertyCity: property.city,
        timestamp,
      });
        }

        // Notify the dealer who was auto-assigned on inquiry creation
        if (autoAssignedTo) {
          const dealerMessage = `A new inquiry for property in ${property.city} has been auto-assigned to you by the system.`;
          const dealerNotif = await PropertyNotificationEvent.create({
            propertyId: property.propertyId,
            userId: autoAssignedTo,
            title: "Inquiry Assigned",
            notificationText: dealerMessage,
          });

          io.to(`user:${autoAssignedTo}`).emit("inquiry:assigned", {
            id: dealerNotif.id,
            inquiryId: inquiryRecord.id,
            propertyId: property.propertyId,
            title: "Inquiry Assigned",
            message: `A new inquiry for ${property.city} has been assigned to you.`,
            propertyCity: property.city,
            timestamp: new Date().toISOString(),
        assignedBy: "system",
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
          status: 201,
          body: {
            success: true,
            message: "Inquiry created successfully",
          },
        },
        requestStartTime,
        requestBodyLog
      );

      return sendEncodedResponse(
        res,
        201,
        true,
        "Inquiry created successfully",
        {
          inquiryId: inquiryRecord.id,
          inquiry: inquiryRecord.inquiry,
          priority: inquiryRecord.priority,
          autoAssignedTo: autoAssignedTo || null,
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
        const oldAssignee = await User.findByPk(oldAssignedTo, {
          attributes: ["firstName", "lastName"],
        });
        if (oldAssignee)
          oldAssigneeName = `${oldAssignee.firstName} ${oldAssignee.lastName}`;
      }

      // Fetch admins & super admins
      const adminUsers = await User.findAll({
        include: [
          {
            model: Role,
            as: "roles",
            where: {
              roleName: { [Op.in]: ["Admin", "Super Admin"] },
              isActive: true,
            },
            through: { attributes: [] },
          },
        ],
        attributes: ["userId"],
        raw: true,
      });
      const adminIds = adminUsers.map((a) => a.userId);

      // Fetch sales manager of the new assignee (client dealer)
      let salesManagerId = null;
      const smRel = await SalesRelationship.findOne({
        where: { salesExecutiveId: assignedTo, isActive: true },
      });
      if (smRel) salesManagerId = smRel.salesManagerId;

      // Fetch sales manager of the old assignee (for reassignment notifications)
      let oldSalesManagerId = null;
      if (isReassign && oldAssignedTo) {
        const oldSmRel = await SalesRelationship.findOne({
          where: { salesExecutiveId: oldAssignedTo, isActive: true },
        });
        if (oldSmRel) oldSalesManagerId = oldSmRel.salesManagerId;
      }

      // Notify new assignee
      const newMessage = isReassign
        ? `An inquiry for property in ${city} has been reassigned to you by ${assignerName}.`
        : `A new inquiry for property in ${city} has been assigned to you by ${assignerName}.`;
      notificationRecords.push({
        propertyId: inquiry.propertyId,
        userId: assignedTo,
        title: "Inquiry Assigned",
        notificationText: newMessage,
      });
      io.to(`user:${assignedTo}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        message: newMessage,
        assignedBy: adminId,
        assignedByName: assignerName,
        timestamp,
      });

      // Notify old assignee
      if (isReassign && oldAssignedTo) {
        const oldMessage = `An inquiry for property in ${city} has been reassigned to ${newAssigneeName} by ${assignerName}.`;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: oldAssignedTo,
          title: "Inquiry Unassigned",
          notificationText: oldMessage,
        });
        io.to(`user:${oldAssignedTo}`).emit("inquiry:unassigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: oldMessage,
          reassignedBy: adminId,
          reassignedByName: assignerName,
          reassignedTo: assignedTo,
          reassignedToName: newAssigneeName,
          timestamp,
        });
      }

      // Notify admins & super admins
      const adminMessage = isReassign
        ? `Inquiry for property in ${city} has been reassigned from ${oldAssigneeName || "unassigned"} to ${newAssigneeName} by ${assignerName}.`
        : `A new inquiry for property in ${city} has been assigned to ${newAssigneeName} by ${assignerName}.`;
      for (const aId of adminIds) {
        if (aId === adminId) continue; // skip if assigner is admin
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: aId,
          notificationText: adminMessage,
          title: "Inquiry Assigned",
        });
        io.to(`user:${aId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: adminMessage,
          assignedTo,
          assignedToName: newAssigneeName,
          assignedBy: adminId,
          assignedByName: assignerName,
          timestamp,
        });
      }

      // Notify sales manager of new assignee
      if (
        salesManagerId &&
        salesManagerId !== adminId &&
        !adminIds.includes(salesManagerId)
      ) {
        const smMessage = isReassign
          ? `Inquiry for property in ${city} has been reassigned from ${oldAssigneeName || "unassigned"} to ${newAssigneeName} by ${assignerName}.`
          : `A new inquiry for property in ${city} has been assigned to ${newAssigneeName} by ${assignerName}.`;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: salesManagerId,
          notificationText: smMessage,
          title: "Inquiry Assigned",
        });
        io.to(`user:${salesManagerId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: smMessage,
          assignedTo,
          assignedToName: newAssigneeName,
          assignedBy: adminId,
          assignedByName: assignerName,
          timestamp,
        });
      }

      // Notify old sales manager on reassignment (if different from new manager, assigner, and not an admin)
      if (
        isReassign &&
        oldSalesManagerId &&
        oldSalesManagerId !== adminId &&
        !adminIds.includes(oldSalesManagerId) &&
        oldSalesManagerId !== salesManagerId
      ) {
        const oldSmMessage = `Inquiry for property in ${city} has been reassigned from ${oldAssigneeName || "the previous dealer"} to ${newAssigneeName} by ${assignerName}.`;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: oldSalesManagerId,
          title: "Inquiry Unassigned",
          notificationText: oldSmMessage,
        });
        io.to(`user:${oldSalesManagerId}`).emit("inquiry:unassigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: oldSmMessage,
          reassignedBy: adminId,
          reassignedByName: assignerName,
          reassignedTo: assignedTo,
          reassignedToName: newAssigneeName,
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
      isReassign
        ? "Inquiry reassigned successfully"
        : "Inquiry assigned successfully",
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

    // Load-balance to the least-loaded active Client Dealer (shared logic).
    // Enquiries are handled ONLY by Client Dealers.
    const bestDealerId = await pickLeastLoadedDealer(transaction);
    if (!bestDealerId) {
      throw createAppError("No active Client Dealer found to assign the enquiry", 404);
    }

    // Assign
    await inquiry.update(
      {
        assignedTo: bestDealerId,
        assignedBy: adminId,
        assignedAt: new Date(),
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
      const bestDealer = await User.findByPk(bestDealerId, {
        attributes: ["firstName", "lastName"],
      });
      const bestDealerName = bestDealer
        ? `${bestDealer.firstName} ${bestDealer.lastName}`
        : "a Sales Executive";

      // Fetch admins & super admins
      const adminUsers = await User.findAll({
        include: [
          {
            model: Role,
            as: "roles",
            where: {
              roleName: { [Op.in]: ["Admin", "Super Admin"] },
              isActive: true,
            },
            through: { attributes: [] },
          },
        ],
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
      notificationRecords.push({
        propertyId: inquiry.propertyId,
        userId: bestDealerId,
        title: "Inquiry Assigned",
        notificationText: dealerMessage,
      });
      io.to(`user:${bestDealerId}`).emit("inquiry:assigned", {
        inquiryId: inquiry.id,
        propertyId: inquiry.propertyId,
        message: dealerMessage,
        assignedBy: adminId,
        assignedByName: adminName,
        timestamp,
      });

      // Notify admins & super admins
      const adminMessage = `An inquiry for property in ${inquiryCity} has been auto-assigned to ${bestDealerName} by ${adminName}.`;
      for (const aId of adminIds) {
        if (aId === adminId) continue;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: aId,
          notificationText: adminMessage,
          title: "Inquiry Assigned",
        });
        io.to(`user:${aId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: adminMessage,
          assignedTo: bestDealerId,
          assignedToName: bestDealerName,
          assignedBy: adminId,
          assignedByName: adminName,
          timestamp,
        });
      }

      // Notify sales manager
      if (
        salesManagerId &&
        salesManagerId !== adminId &&
        !adminIds.includes(salesManagerId)
      ) {
        const smMessage = `An inquiry for property in ${inquiryCity} has been auto-assigned to ${bestDealerName} by ${adminName}.`;
        notificationRecords.push({
          propertyId: inquiry.propertyId,
          userId: salesManagerId,
          title: "Inquiry Assigned",
          notificationText: smMessage,
        });
        io.to(`user:${salesManagerId}`).emit("inquiry:assigned", {
          inquiryId: inquiry.id,
          propertyId: inquiry.propertyId,
          message: smMessage,
          assignedTo: bestDealerId,
          assignedToName: bestDealerName,
          assignedBy: adminId,
          assignedByName: adminName,
          timestamp,
        });
      }

      await PropertyNotificationEvent.bulkCreate(notificationRecords, {
        transaction,
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
  const { page = 1, limit = 10, priority, assignment } = req.query;
  const pageNumber = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNumber - 1) * pageSize;

  // The admin Work Board shows ALL active enquiries (assigned + unassigned).
  // An optional `assignment` filter narrows it: "unassigned" | "assigned".
  const whereClause = {
    ...(priority && { priority }),
  };
  if (assignment === "unassigned") {
    whereClause.assignedTo = null;
  } else if (assignment === "assigned") {
    whereClause.assignedTo = { [Op.not]: null };
  }

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
        attributes: ["userId", "firstName", "lastName", "email"],
        required: true,
      },
      {
        // Who the enquiry is assigned to (null when unassigned). Optional join
        // so unassigned enquiries are still returned.
        model: User,
        as: "clientDealer",
        attributes: ["userId", "firstName", "lastName", "email"],
        required: false,
      },
      {
        model: InquiryStage,
        as: "stage",
        attributes: ["id", "name", "color"],
        required: false,
      },
    ],
    order: [
      // Unassigned first (they need attention), then by priority, then oldest.
      [sequelize.literal('"PropertyInquiry"."assigned_to" IS NOT NULL'), "ASC"],
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
    "Active inquiries fetched",
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
  const userId = req.user.userId;
  const userRole = req.userRole || req.user.role;
  const { page = 1, limit = 10, search = "" } = req.query;

  const pageNumber = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNumber - 1) * pageSize;

  const whereClause = {
    assignedTo: { [Op.not]: null },
  };

  if (["Admin", "Super Admin"].includes(userRole)) {
    // Admins see all assigned inquiries
  } else if (userRole === "Sales Manager") {
    // Sales Manager sees inquiries assigned to their entire team
    const relationships = await SalesRelationship.findAll({
      where: { salesManagerId: userId, isActive: true },
      attributes: ["salesExecutiveId"],
      raw: true,
    });
    const teamIds = relationships.map((r) => r.salesExecutiveId);
    teamIds.push(userId); // include manager's own assignments
    whereClause.assignedTo = { [Op.in]: teamIds };
  } else {
    // Sales Executive (Property Manager or Client Dealer) — only their own
    whereClause.assignedTo = userId;
  }

  // Add search functionality
  const searchClause = search ? {
    [Op.or]: [
      { '$property.city$': { [Op.iLike]: `%${search}%` } },
      { '$property.micro_market$': { [Op.iLike]: `%${search}%` } },
      { '$property.property_type$': { [Op.iLike]: `%${search}%` } },
      { '$inquirer.first_name$': { [Op.iLike]: `%${search}%` } },
      { '$inquirer.last_name$': { [Op.iLike]: `%${search}%` } },
      { '$inquirer.email$': { [Op.iLike]: `%${search}%` } },
      { '$clientDealer.first_name$': { [Op.iLike]: `%${search}%` } },
      { '$clientDealer.last_name$': { [Op.iLike]: `%${search}%` } },
      { inquiry: { [Op.iLike]: `%${search}%` } },
    ]
  } : {};

  const { count, rows: inquiries } = await PropertyInquiry.findAndCountAll({
    where: { ...whereClause, ...searchClause },
    subQuery: false,
    include: [
      { 
        model: Property, 
        as: "property",
        required: true, 
        include: [{
          model: PropertyMedia,
          as: "media",
          attributes: ["fileUrl", "mediaType"],
          limit: 1
        }]
      },
      { 
        model: User, 
        as: "inquirer", 
        required: search ? true : false 
      },
      {
        model: User,
        as: "clientDealer",
        attributes: ["firstName", "lastName", "email"],
        required: search ? true : false
      },
      {
        model: InquiryStage,
        as: "stage",
        attributes: ["id", "name", "color", "isTerminal"],
        required: false,
      },
    ],
    order: [
      ["priority", "DESC"],
      ["assigned_at", "DESC"],
    ],
    limit: pageSize,
    offset,
    distinct: true,
  });

  // Enquiry score = points of the HIGHEST stage reached (from the stage-change
  // history), so revisiting an earlier stage doesn't lower a lead's score.
  const enquiryIds = inquiries.map((i) => i.id);
  const scoreMap = {};
  if (enquiryIds.length) {
    const scoreRows = await InquiryStatusHistory.findAll({
      where: { inquiryId: { [Op.in]: enquiryIds } },
      attributes: [
        "inquiryId",
        [sequelize.fn("MAX", sequelize.col("stage.score")), "maxScore"],
      ],
      include: [{ model: InquiryStage, as: "stage", attributes: [] }],
      group: ["InquiryStatusHistory.inquiry_id"],
      raw: true,
    });
    scoreRows.forEach((r) => {
      scoreMap[r.inquiryId] = parseInt(r.maxScore, 10) || 0;
    });
  }
  // Count unseen CLIENT messages per enquiry so the board can badge enquiries
  // with a new reply. "Client" = the inquirer side (senderType "broker", which
  // covers both broker and investor inquirers). A message is "unseen" if it was
  // created after the dealer last opened the thread (dealerLastSeenAt), or the
  // dealer has never opened it (dealerLastSeenAt is null).
  const unreadMap = {};
  if (enquiryIds.length) {
    const clientMsgs = await InquiryMessage.findAll({
      where: { inquiryId: { [Op.in]: enquiryIds }, senderType: "broker" },
      attributes: ["inquiryId", "createdAt"],
      raw: true,
    });
    const lastSeenById = {};
    inquiries.forEach((i) => {
      lastSeenById[i.id] = i.dealerLastSeenAt
        ? new Date(i.dealerLastSeenAt).getTime()
        : 0;
    });
    clientMsgs.forEach((m) => {
      const seenTs = lastSeenById[m.inquiryId] ?? 0;
      if (new Date(m.createdAt).getTime() > seenTs) {
        unreadMap[m.inquiryId] = (unreadMap[m.inquiryId] || 0) + 1;
      }
    });
  }

  const enriched = inquiries.map((row) => {
    const json = row.toJSON();
    // Fall back to the current stage's score if there's no history yet.
    json.score = scoreMap[json.id] ?? json.stage?.score ?? 0;
    json.unreadClientMessages = unreadMap[json.id] || 0;
    return json;
  });

  return sendEncodedResponse(
    res,
    200,
    true,
    "Assigned inquiries fetched",
    enriched,
    {
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalItems: count,
        totalPages: Math.ceil(count / pageSize),
        hasNextPage: pageNumber < Math.ceil(count / pageSize),
        hasPrevPage: pageNumber > 1,
      },
    }
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

const getMyInquiries = asyncHandler(async (req, res, next) => {
  const inquirerId = req.user.userId;
  const { page = 1, limit = 10, inquirerRoleType } = req.query;

  const pageNumber = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNumber - 1) * pageSize;

  const whereClause = {
    inquirerId,
    ...(inquirerRoleType && { inquirerRoleType }),
  };

  const { count, rows: inquiries } = await PropertyInquiry.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Property,
        as: "property",
        attributes: ["propertyId", "city", "state", "propertyType", "sellingPrice", "annualGrossRent"],
      },
      {
        model: User,
        as: "inquirer",
        attributes: ["userId", "firstName", "lastName", "email"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: pageSize,
    offset,
    distinct: true,
  });

  // Latest APPROVED message time per enquiry, so the dashboard can show an
  // "update" badge (the inquirer only ever sees approved dealer messages).
  const ids = inquiries.map((i) => i.id);
  const latestMsgMap = {};
  if (ids.length) {
    const rows = await InquiryMessage.findAll({
      where: { inquiryId: { [Op.in]: ids }, status: "approved" },
      attributes: [
        "inquiryId",
        [sequelize.fn("MAX", sequelize.col("created_at")), "latest"],
      ],
      group: ["inquiryId"],
      raw: true,
    });
    rows.forEach((r) => {
      latestMsgMap[r.inquiryId] = r.latest;
    });
  }
  const data = inquiries.map((row) => {
    const json = row.toJSON();
    json.latestMessageAt = latestMsgMap[json.id] || null;
    return json;
  });

  return sendEncodedResponse(
    res,
    200,
    true,
    "My inquiries fetched",
    data,
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

const getInquiryById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const inquiry = await PropertyInquiry.findOne({
    where: { id },
    include: [
      {
        model: Property,
        as: "property",
        attributes: ["propertyId", "propertyType", "city", "state", "sellingPrice", "annualGrossRent"],
      },
      {
        model: User,
        as: "inquirer",
        attributes: ["userId", "firstName", "lastName", "email", "mobileNumber"],
      },
    ],
  });

  if (!inquiry) {
    throw createAppError("Inquiry not found", 404);
  }

  // Security check: Only allow the inquirer or admins/assigned sales to view details
  const userRole = req.userRole || req.user.role;
  const isAdmin = ["Admin", "Super Admin", "Sales Manager"].includes(userRole);
  if (!isAdmin && inquiry.inquirerId !== userId && inquiry.assignedTo !== userId) {
    throw createAppError("You do not have permission to view this inquiry", 403);
  }

  return sendEncodedResponse(res, 200, true, "Inquiry details fetched successfully", inquiry);
});

module.exports = {
  createPropertyInquiry,
  assignInquiry,
  autoAssignInquiry,
  getPendingInquiries,
  getAssignedInquiries,
  getMyInquiries,
  getInquiryById,
};
