const { SupportRequest, User } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const createAppError = require("../utils/appError");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { getPagination, isValidEmail } = require("../utils/validators");

// POST /api/v1/support-requests  (public — guest or logged-in)
const createSupportRequest = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !String(name).trim()) throw createAppError("name is required", 400);
  if (!message || !String(message).trim()) throw createAppError("message is required", 400);
  if (email && !isValidEmail(email)) throw createAppError("Invalid email format", 400);

  const request = await SupportRequest.create({
    userId: req.user?.userId || null, // authenticateUser is optional on this route
    name: String(name).trim(),
    email: email || null,
    phone: phone || null,
    subject: subject || null,
    message: String(message).trim(),
    status: "open",
  });

  return sendEncodedResponse(res, 201, true, "Your support request has been submitted. Our team will reach out soon.", {
    requestId: request.requestId,
  });
});

// GET /api/v1/admin/support-requests  (Admin/Super Admin)
const getSupportRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { pageNumber, pageSize, offset } = getPagination(page, limit, 20);
  const where = {};
  if (status) where.status = status;

  const { count, rows } = await SupportRequest.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["userId", "firstName", "lastName", "email", "mobileNumber"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
  });

  return sendEncodedResponse(res, 200, true, "Support requests fetched successfully", rows, {
    pagination: {
      currentPage: pageNumber,
      pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
    },
  });
});

// PATCH /api/v1/admin/support-requests/:requestId  (Admin/Super Admin) — update status
const updateSupportRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body;
  const allowed = ["open", "in_progress", "resolved"];
  if (!allowed.includes(status)) {
    throw createAppError(`status must be one of: ${allowed.join(", ")}`, 400);
  }
  const request = await SupportRequest.findByPk(requestId);
  if (!request) throw createAppError("Support request not found", 404);
  await request.update({ status });
  return sendEncodedResponse(res, 200, true, "Support request updated", { requestId, status });
});

module.exports = { createSupportRequest, getSupportRequests, updateSupportRequest };
