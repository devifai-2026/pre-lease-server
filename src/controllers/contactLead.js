const { ContactLead, User } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const createAppError = require("../utils/appError");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { getPagination, isValidEmail } = require("../utils/validators");

// POST /api/v1/contact-leads  (public — guest or logged-in)
const createContactLead = asyncHandler(async (req, res) => {
  const { name, email, phone, role, message } = req.body;

  if (!name || !String(name).trim()) throw createAppError("name is required", 400);
  if (!email || !String(email).trim()) throw createAppError("email is required", 400);
  if (!isValidEmail(email)) throw createAppError("Invalid email format", 400);
  if (!message || !String(message).trim()) throw createAppError("message is required", 400);
  if (phone && !/^[6-9]\d{9}$/.test(String(phone))) {
    throw createAppError("Invalid phone number", 400);
  }

  const lead = await ContactLead.create({
    userId: req.user?.userId || null, // attachUserIfPresent makes auth optional
    name: String(name).trim(),
    email: String(email).trim(),
    phone: phone || null,
    role: role || null,
    message: String(message).trim(),
    status: "open",
  });

  return sendEncodedResponse(
    res,
    201,
    true,
    "Thanks for reaching out! Our team will get back to you soon.",
    { leadId: lead.leadId }
  );
});

// GET /api/v1/admin/contact-leads  (Admin/Super Admin)
const getContactLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, role } = req.query;
  const { pageNumber, pageSize, offset } = getPagination(page, limit, 20);

  const where = {};
  if (status) where.status = status;
  if (role) where.role = role;

  const { count, rows } = await ContactLead.findAndCountAll({
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

  return sendEncodedResponse(res, 200, true, "Contact leads fetched successfully", rows, {
    pagination: {
      currentPage: pageNumber,
      pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
    },
  });
});

// PATCH /api/v1/admin/contact-leads/:leadId  (Admin/Super Admin) — update status
const updateContactLead = asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { status } = req.body;
  const allowed = ["open", "in_progress", "resolved"];
  if (!allowed.includes(status)) {
    throw createAppError(`status must be one of: ${allowed.join(", ")}`, 400);
  }
  const lead = await ContactLead.findByPk(leadId);
  if (!lead) throw createAppError("Contact lead not found", 404);
  await lead.update({ status });
  return sendEncodedResponse(res, 200, true, "Contact lead updated", { leadId, status });
});

module.exports = { createContactLead, getContactLeads, updateContactLead };
