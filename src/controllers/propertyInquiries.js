const { Property, PropertyInquiry, User } = require("../models");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { logRequest } = require("../utils/logs");
const { sequelize } = require("../config/dbConnection");

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
      attributes: ["propertyId", "city", "state"],
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
      }

      await transaction.commit();

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
    if (inquiry.status !== "pending") {
      throw createAppError("Inquiry can only be assigned when pending", 400);
    }

    if (!assignedTo) {
      throw createAppError("assignedTo is required", 400);
    }

    await inquiry.update(
      {
        assignedTo,
        assignedBy: adminId,
        assignedAt: new Date(),
        status: "assigned",
      },
      { transaction }
    );

    await transaction.commit();

    await logRequest(
      req,
      {
        userId: adminId,
        status: 200,
        body: { success: true, message: "Inquiry assigned successfully" },
      },
      requestStartTime,
      requestBodyLog
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Inquiry assigned successfully",
      {
        inquiryId: inquiry.id,
        assignedTo,
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
  getPendingInquiries,
  getAssignedInquiries,
};
