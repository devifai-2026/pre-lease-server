const {
  InquiryMessage,
  PropertyInquiry,
  User,
  Role,
  Property,
  InquiryStage,
  PropertyNotificationEvent,
} = require("../models");

// Once an enquiry reaches the "Converted" stage the deal is done; the
// conversation is locked so only admins/super admins may post (the dealer and
// the inquirer can still READ the thread, just not send).
const CONVERTED_STAGE_NAME = "Converted";
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { sequelize } = require("../config/dbConnection");
const { Op } = require("sequelize");

// Persist a notification (with the property so it's clickable in the dropdown)
// and emit a socket event. Never throws — notifications are best-effort.
const safeNotify = async (recipients, title, text, inquiryId, propertyId) => {
  const list = [...new Set(recipients.filter(Boolean))];
  if (!list.length) return;
  await PropertyNotificationEvent.bulkCreate(
    list.map((userId) => ({
      userId,
      title,
      notificationText: text,
      // Carry propertyId so the notification dropdown can deep-link to it.
      propertyId: propertyId || null,
    }))
  ).catch(() => {});
  try {
    const { getIO } = require("../config/socket");
    const io = getIO();
    list.forEach((userId) =>
      io
        .to(`user:${userId}`)
        .emit("inquiry:message", { inquiryId, propertyId, title, text })
    );
  } catch {
    /* sockets optional */
  }
};

// Helper: load the inquiry + verify the requester may act on it.
// Dealer must be the assigned dealer; the inquirer must own the enquiry;
// admins/managers always allowed.
const loadInquiryForUser = async (inquiryId, req) => {
  const inquiry = await PropertyInquiry.findByPk(inquiryId, {
    include: [
      { model: Property, as: "property", attributes: ["propertyId", "city", "ownerId"] },
      // Stage tells us whether the enquiry is locked (Converted).
      { model: InquiryStage, as: "stage", attributes: ["id", "name"] },
    ],
  });
  if (!inquiry) return { error: createAppError("Enquiry not found", 404) };

  const role = req.user.role || "";
  const userId = req.user.userId;
  // Posting after conversion is admin-only, so a Sales Manager is NOT enough
  // here — track that separately from the broader admin/manager check.
  const isAdmin = ["Admin", "Super Admin"].includes(role);
  const isAdminOrManager = isAdmin || role === "Sales Manager";
  const isAssignedDealer = inquiry.assignedTo === userId;
  const isInquirer = inquiry.inquirerId === userId;
  const isConverted = inquiry.stage?.name === CONVERTED_STAGE_NAME;

  return { inquiry, isAdmin, isAdminOrManager, isAssignedDealer, isInquirer, isConverted };
};

// ─── POST a message ──────────────────────────────────────────────────────
// Dealer/admin message → 'pending' (needs admin approval) unless sent by admin.
// Inquirer (broker/investor) message → shown directly to the dealer.
const postMessage = asyncHandler(async (req, res, next) => {
  const { inquiryId } = req.params;
  const { message } = req.body;
  const userId = req.user.userId;
  const role = req.user.role || "";

  if (!message || !message.trim()) {
    return next(createAppError("Message cannot be empty", 400));
  }

  const ctx = await loadInquiryForUser(inquiryId, req);
  if (ctx.error) return next(ctx.error);
  const { inquiry, isAdmin, isAdminOrManager, isAssignedDealer, isInquirer, isConverted } = ctx;

  if (!isAdminOrManager && !isAssignedDealer && !isInquirer) {
    return next(createAppError("You can't message on this enquiry", 403));
  }

  // Once converted, the thread is locked to everyone except Admin / Super Admin.
  if (isConverted && !isAdmin) {
    return next(
      createAppError(
        "This enquiry is converted. Only an admin can send messages now.",
        403
      )
    );
  }

  // Sender side + approval rule.
  const senderType = isInquirer ? "broker" : "dealer"; // "broker" = the inquirer (broker OR investor)
  // Inquirer replies and admin/manager messages are auto-approved; a Client
  // Dealer's message needs admin approval before the inquirer sees it.
  const status = isInquirer || isAdminOrManager ? "approved" : "pending";

  const record = await InquiryMessage.create({
    inquiryId,
    senderId: userId,
    senderType,
    message: message.trim(),
    status,
    reviewedBy: status === "approved" && !isInquirer ? userId : null,
  });

  // Notifications
  const city = inquiry.property?.city || "the property";
  if (status === "pending") {
    // Notify admins to review.
    const admins = await User.findAll({
      attributes: ["userId"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
          where: { roleName: { [Op.in]: ["Admin", "Super Admin"] }, isActive: true },
          attributes: [],
        },
      ],
    });
    await safeNotify(
      admins.map((a) => a.userId),
      "Enquiry message needs approval",
      `A dealer message on the enquiry in ${city} is awaiting your approval.`,
      inquiryId,
      inquiry.propertyId
    );
  } else if (isInquirer) {
    // Broker/investor replied → notify the assigned dealer.
    await safeNotify(
      [inquiry.assignedTo],
      "New enquiry reply",
      `The client replied on the enquiry in ${city}.`,
      inquiryId,
      inquiry.propertyId
    );
  } else {
    // Admin/manager message auto-approved → notify the inquirer.
    await safeNotify(
      [inquiry.inquirerId],
      "New enquiry message",
      `You have a new message on your enquiry in ${city}.`,
      inquiryId,
      inquiry.propertyId
    );
  }

  return sendEncodedResponse(res, 201, true, "Message posted", record);
});

// ─── ADMIN approve / edit / decline a pending dealer message ───────────────
const reviewMessage = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  const { action, editedMessage, declineReason } = req.body;
  const adminId = req.user.userId;

  if (!["approve", "decline"].includes(action)) {
    return next(createAppError("action must be 'approve' or 'decline'", 400));
  }

  const msg = await InquiryMessage.findByPk(messageId);
  if (!msg) return next(createAppError("Message not found", 404));
  if (msg.status !== "pending") {
    return next(createAppError("Only pending messages can be reviewed", 400));
  }

  if (action === "approve") {
    await msg.update({
      status: "approved",
      editedMessage:
        editedMessage && editedMessage.trim() ? editedMessage.trim() : null,
      reviewedBy: adminId,
    });
    const inquiry = await PropertyInquiry.findByPk(msg.inquiryId, {
      include: [{ model: Property, as: "property", attributes: ["propertyId", "city"] }],
    });
    await safeNotify(
      [inquiry?.inquirerId],
      "New enquiry message",
      `You have a new message on your enquiry in ${inquiry?.property?.city || "the property"}.`,
      msg.inquiryId,
      inquiry?.propertyId
    );
  } else {
    const inquiry = await PropertyInquiry.findByPk(msg.inquiryId, {
      attributes: ["propertyId"],
    });
    await msg.update({
      status: "denied",
      reviewedBy: adminId,
      declineReason: declineReason || null,
    });
    // Let the dealer know their message was declined.
    await safeNotify(
      [msg.senderId],
      "Enquiry message declined",
      `Your message was declined by an admin.${declineReason ? ` Reason: ${declineReason}` : ""}`,
      msg.inquiryId,
      inquiry?.propertyId
    );
  }

  return sendEncodedResponse(res, 200, true, `Message ${action}d`, msg);
});

// ─── LIST the thread ───────────────────────────────────────────────────────
// Inquirer sees only approved messages + their own; dealer/admin see everything.
const getMessages = asyncHandler(async (req, res, next) => {
  const { inquiryId } = req.params;
  const userId = req.user.userId;

  const ctx = await loadInquiryForUser(inquiryId, req);
  if (ctx.error) return next(ctx.error);
  const { inquiry, isAdminOrManager, isAssignedDealer, isInquirer } = ctx;

  if (!isAdminOrManager && !isAssignedDealer && !isInquirer) {
    return next(createAppError("You can't view this enquiry", 403));
  }

  // The assigned dealer is opening the thread → mark client messages as seen,
  // which clears the "new message" badge on the enquiry board.
  if (isAssignedDealer) {
    try {
      await inquiry.update({ dealerLastSeenAt: new Date() });
    } catch (e) {
      // Non-fatal: failing to stamp the seen time shouldn't block reading.
    }
  }

  const where = { inquiryId };
  if (isInquirer && !isAdminOrManager && !isAssignedDealer) {
    // Inquirer: only approved messages, plus their own (any status).
    where[Op.or] = [{ status: "approved" }, { senderId: userId }];
  }

  const messages = await InquiryMessage.findAll({
    where,
    include: [
      { model: User, as: "sender", attributes: ["userId", "firstName", "lastName"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  // Present the approved/edited text as the visible message.
  const data = messages.map((m) => {
    const j = m.toJSON();
    j.displayMessage = j.editedMessage || j.message;
    return j;
  });

  return sendEncodedResponse(res, 200, true, "Messages fetched", data);
});

// ─── ADMIN: list all PENDING dealer messages awaiting approval ─────────────
// Sales Manager sees their team's dealers' pending messages; Admin/Super Admin
// see all. Returns the messages with enquiry + property + sender context.
const getPendingMessages = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const role = req.user.role || "";

  let dealerFilter = null; // null = all dealers
  if (role === "Sales Manager") {
    const { SalesRelationship } = require("../models");
    const rels = await SalesRelationship.findAll({
      where: { salesManagerId: userId, isActive: true },
      attributes: ["salesExecutiveId"],
      raw: true,
    });
    dealerFilter = rels.map((r) => r.salesExecutiveId);
    dealerFilter.push(userId);
  }

  const where = { status: "pending" };
  if (dealerFilter) where.senderId = { [Op.in]: dealerFilter };

  const messages = await InquiryMessage.findAll({
    where,
    include: [
      { model: User, as: "sender", attributes: ["userId", "firstName", "lastName"] },
      {
        model: PropertyInquiry,
        as: "inquiry",
        attributes: ["id", "inquirerId"],
        include: [
          { model: Property, as: "property", attributes: ["propertyId", "propertyType", "city"] },
          { model: User, as: "inquirer", attributes: ["firstName", "lastName", "email"] },
        ],
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  return sendEncodedResponse(res, 200, true, "Pending messages fetched", messages, {
    count: messages.length,
  });
});

// Lightweight count only (for the sidebar badge).
const getPendingMessagesCount = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const role = req.user.role || "";
  const where = { status: "pending" };
  if (role === "Sales Manager") {
    const { SalesRelationship } = require("../models");
    const rels = await SalesRelationship.findAll({
      where: { salesManagerId: userId, isActive: true },
      attributes: ["salesExecutiveId"],
      raw: true,
    });
    const ids = rels.map((r) => r.salesExecutiveId);
    ids.push(userId);
    where.senderId = { [Op.in]: ids };
  }
  const count = await InquiryMessage.count({ where });
  return sendEncodedResponse(res, 200, true, "Pending count", { count });
});

module.exports = {
  postMessage,
  reviewMessage,
  getMessages,
  getPendingMessages,
  getPendingMessagesCount,
};
