const {
  InquiryStage,
  InquiryStatusHistory,
  PropertyInquiry,
  Property,
  PropertyMedia,
  User,
  SalesRelationship,
} = require("../models");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { sequelize } = require("../config/dbConnection");
const { Op } = require("sequelize");

// ============================================================
// STAGE CONFIG (Admin) — list / create / update / reorder / delete
// ============================================================

// List stages. Pass ?all=true (admin config) to include inactive ones.
const getStages = asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === "true";
  const where = includeInactive ? {} : { isActive: true };
  const stages = await InquiryStage.findAll({
    where,
    order: [
      ["sortOrder", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
  return sendEncodedResponse(res, 200, true, "Stages fetched successfully", stages);
});

// Validate a score value: required, integer, non-negative.
const parseScore = (raw) => {
  if (raw === undefined || raw === null || raw === "") return { error: "Score is required" };
  const n = Number(raw);
  if (!Number.isInteger(n)) return { error: "Score must be a whole number" };
  if (n < 0) return { error: "Score cannot be negative" };
  return { value: n };
};

const createStage = asyncHandler(async (req, res, next) => {
  const { name, color, isTerminal, score } = req.body;
  if (!name || !name.trim()) {
    return next(createAppError("Stage name is required", 400));
  }
  const scoreResult = parseScore(score);
  if (scoreResult.error) return next(createAppError(scoreResult.error, 400));

  // New stage goes to the end of the pipeline.
  const max = await InquiryStage.max("sortOrder");
  const stage = await InquiryStage.create({
    name: name.trim(),
    color: color || null,
    isTerminal: !!isTerminal,
    score: scoreResult.value,
    sortOrder: (Number.isFinite(max) ? max : 0) + 1,
    isActive: true,
    isSystem: false,
  });
  return sendEncodedResponse(res, 201, true, "Stage created successfully", stage);
});

const updateStage = asyncHandler(async (req, res, next) => {
  const { stageId } = req.params;
  const stage = await InquiryStage.findByPk(stageId);
  if (!stage) return next(createAppError("Stage not found", 404));

  const { name, color, isTerminal, isActive, score } = req.body;
  const updates = {};
  if (name !== undefined) {
    if (!name.trim()) return next(createAppError("Stage name cannot be empty", 400));
    updates.name = name.trim();
  }
  if (color !== undefined) updates.color = color || null;
  if (isTerminal !== undefined) updates.isTerminal = !!isTerminal;
  // System stages can be renamed/recoloured/deactivated but their isActive flip
  // is allowed; only deletion is blocked elsewhere.
  if (isActive !== undefined) updates.isActive = !!isActive;
  if (score !== undefined) {
    const scoreResult = parseScore(score);
    if (scoreResult.error) return next(createAppError(scoreResult.error, 400));
    updates.score = scoreResult.value;
  }

  await stage.update(updates);
  return sendEncodedResponse(res, 200, true, "Stage updated successfully", stage);
});

// Reorder: accepts { order: [stageId1, stageId2, ...] } and rewrites sortOrder.
const reorderStages = asyncHandler(async (req, res, next) => {
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return next(createAppError("order must be a non-empty array of stage ids", 400));
  }
  await Promise.all(
    order.map((id, idx) =>
      InquiryStage.update({ sortOrder: idx + 1 }, { where: { id } })
    )
  );
  const stages = await InquiryStage.findAll({ order: [["sortOrder", "ASC"]] });
  return sendEncodedResponse(res, 200, true, "Stages reordered successfully", stages);
});

const deleteStage = asyncHandler(async (req, res, next) => {
  const { stageId } = req.params;
  const stage = await InquiryStage.findByPk(stageId);
  if (!stage) return next(createAppError("Stage not found", 404));
  if (stage.isSystem) {
    return next(
      createAppError("Default stages can't be deleted — deactivate them instead", 400)
    );
  }
  // Don't orphan inquiries sitting on this stage.
  const inUse = await PropertyInquiry.count({ where: { stageId } });
  if (inUse > 0) {
    return next(
      createAppError(
        `Cannot delete: ${inUse} enquiry(ies) are currently in this stage. Move them first or deactivate the stage.`,
        400
      )
    );
  }
  await stage.destroy();
  return sendEncodedResponse(res, 200, true, "Stage deleted successfully", null);
});

// ============================================================
// INQUIRY STAGE UPDATE (Sales/Admin) — move an enquiry + add a note
// ============================================================

const updateInquiryStage = asyncHandler(async (req, res, next) => {
  const { inquiryId } = req.params;
  const { stageId, note } = req.body;
  const userId = req.user.userId;

  if (!stageId) return next(createAppError("stageId is required", 400));

  const inquiry = await PropertyInquiry.findByPk(inquiryId);
  if (!inquiry) return next(createAppError("Enquiry not found", 404));

  const stage = await InquiryStage.findByPk(stageId);
  if (!stage || !stage.isActive) {
    return next(createAppError("Invalid or inactive stage", 400));
  }

  // Sales executives may only update their own assigned enquiries; admins and
  // managers can update any (route already gates by role).
  const role = req.user.role || "";
  const isPrivileged = ["Admin", "Super Admin", "Sales Manager"].includes(role);
  if (!isPrivileged && inquiry.assignedTo !== userId) {
    return next(createAppError("You can only update enquiries assigned to you", 403));
  }

  await inquiry.update({ stageId });
  const history = await InquiryStatusHistory.create({
    inquiryId,
    stageId,
    stageName: stage.name,
    note: note ? String(note).trim() : null,
    changedBy: userId,
  });

  return sendEncodedResponse(res, 200, true, "Enquiry stage updated", {
    inquiryId,
    stageId,
    stageName: stage.name,
    history,
  });
});

// Full timeline for an enquiry (newest first).
const getInquiryHistory = asyncHandler(async (req, res) => {
  const { inquiryId } = req.params;
  const history = await InquiryStatusHistory.findAll({
    where: { inquiryId },
    include: [
      {
        model: User,
        as: "changedByUser",
        attributes: ["userId", "firstName", "lastName", "email"],
      },
      { model: InquiryStage, as: "stage", attributes: ["id", "name", "color", "isTerminal"] },
    ],
    order: [["createdAt", "DESC"]],
  });
  return sendEncodedResponse(res, 200, true, "Enquiry history fetched", history);
});

// ============================================================
// ENQUIRY REPORT — every enquiry with its stage, score & transfer history.
// Role-scoped: Admin/Super Admin → all; Sales Manager → team; Dealer → own.
// Filters: fromDate, toDate, assignedTo, stageId.
// ============================================================
const getEnquiryReport = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const userRole = req.userRole || req.user.role;
  const { fromDate, toDate, assignedTo, stageId, page = 1, limit = 25 } = req.query;

  const pageNumber = parseInt(page);
  const pageSize = parseInt(limit);
  const offset = (pageNumber - 1) * pageSize;

  const where = {};

  // Role scoping (mirrors getAssignedInquiries).
  if (["Admin", "Super Admin"].includes(userRole)) {
    // all
  } else if (userRole === "Sales Manager") {
    const rels = await SalesRelationship.findAll({
      where: { salesManagerId: userId, isActive: true },
      attributes: ["salesExecutiveId"],
      raw: true,
    });
    const teamIds = rels.map((r) => r.salesExecutiveId);
    teamIds.push(userId);
    where.assignedTo = { [Op.in]: teamIds };
  } else {
    where.assignedTo = userId;
  }

  // Optional filters
  if (assignedTo) where.assignedTo = assignedTo;
  if (stageId) where.stageId = stageId;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = end;
    }
  }

  const { count, rows } = await PropertyInquiry.findAndCountAll({
    where,
    subQuery: false,
    include: [
      {
        model: Property,
        as: "property",
        attributes: ["propertyId", "propertyType", "microMarket", "city", "state"],
      },
      {
        model: User,
        as: "inquirer",
        attributes: ["userId", "firstName", "lastName", "email"],
      },
      {
        model: User,
        as: "clientDealer",
        attributes: ["userId", "firstName", "lastName"],
      },
      {
        model: InquiryStage,
        as: "stage",
        attributes: ["id", "name", "color", "isTerminal", "score"],
      },
      {
        model: InquiryStatusHistory,
        as: "statusHistory",
        attributes: ["id", "stageName", "note", "createdAt"],
        include: [
          { model: InquiryStage, as: "stage", attributes: ["name", "color", "score"] },
          { model: User, as: "changedByUser", attributes: ["firstName", "lastName"] },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset,
    distinct: true,
  });

  // Highest-stage-reached score per enquiry.
  const ids = rows.map((r) => r.id);
  const scoreMap = {};
  if (ids.length) {
    const scoreRows = await InquiryStatusHistory.findAll({
      where: { inquiryId: { [Op.in]: ids } },
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

  // Resolve each assigned dealer's Sales Manager (via the active sales
  // relationship) so the report can show the reporting manager too.
  const dealerIds = [...new Set(rows.map((r) => r.assignedTo).filter(Boolean))];
  const managerByDealer = {};
  if (dealerIds.length) {
    const rels = await SalesRelationship.findAll({
      where: { salesExecutiveId: { [Op.in]: dealerIds }, isActive: true },
      include: [
        {
          model: User,
          as: "salesManager",
          attributes: ["userId", "firstName", "lastName"],
        },
      ],
    });
    rels.forEach((rel) => {
      if (rel.salesManager) {
        managerByDealer[rel.salesExecutiveId] = {
          userId: rel.salesManager.userId,
          firstName: rel.salesManager.firstName,
          lastName: rel.salesManager.lastName,
        };
      }
    });
  }

  const data = rows.map((row) => {
    const json = row.toJSON();
    json.score = scoreMap[json.id] ?? json.stage?.score ?? 0;
    json.transferCount = Array.isArray(json.statusHistory) ? json.statusHistory.length : 0;
    json.manager = json.assignedTo ? managerByDealer[json.assignedTo] || null : null;
    return json;
  });

  const totalTransfers = data.reduce((sum, d) => sum + d.transferCount, 0);

  return sendEncodedResponse(res, 200, true, "Enquiry report fetched", data, {
    pagination: {
      currentPage: pageNumber,
      pageSize,
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
    },
    counts: { enquiries: count, transfers: totalTransfers },
  });
});

module.exports = {
  getStages,
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
  updateInquiryStage,
  getInquiryHistory,
  getEnquiryReport,
};
