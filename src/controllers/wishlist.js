const { Property, PropertyLike, PropertyMedia, Amenity, Caretaker, User, PropertyVerificationLog, Role } = require("../models");
const { getPagination } = require("../utils/validators");
const createAppError = require("../utils/appError");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { logRequest } = require("../utils/logs");

// Toggle Like (Wishlist) Endpoint
const toggleLikeProperty = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const userId = req.user.userId;

  const requestBodyLog = { propertyId, userId, action: "toggle_like" };

  try {
    const property = await Property.findOne({ where: { propertyId, isActive: true } });
    if (!property) {
      throw createAppError("Property not found", 404);
    }

    // Check if like exists
    const existingLike = await PropertyLike.findOne({
      where: { propertyId, userId }
    });

    let isLiked = false;
    if (existingLike) {
      // Unlike
      await existingLike.destroy();
      isLiked = false;
    } else {
      // Like
      await PropertyLike.create({ propertyId, userId });
      isLiked = true;
    }

    const data = { isLiked };

    await logRequest(
      req,
      {
        userId,
        status: 200,
        body: { success: true, message: isLiked ? "Property liked" : "Property unliked" },
        requestBodyLog
      },
      requestStartTime
    );

    return sendEncodedResponse(res, 200, true, isLiked ? "Property liked" : "Property unliked", data);
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

// Get User's Wishlist Properties
const getWishlistProperties = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const userId = req.user.userId;
  const { page = 1, limit = 10 } = req.query;

  const requestBodyLog = { userId, page, limit, action: "get_wishlist" };

  try {
    const { pageNumber, pageSize, offset } = getPagination(page, limit);

    const { count, rows: likedProperties } = await PropertyLike.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Property,
          as: "property",
          where: { isActive: true },
          include: [
            {
              model: Amenity,
              as: "amenities",
              attributes: ["amenityId", "amenityName"],
              through: { attributes: [] },
              where: { isActive: true },
              required: false,
            },
            {
              model: PropertyMedia,
              as: "media",
              attributes: ["mediaId", "mediaType", "fileUrl"],
              required: false,
              limit: 1,
              separate: true,
            },
          ]
        }
      ],
      limit: pageSize,
      offset,
      order: [["createdAt", "DESC"]],
    });

    // Extract the properties
    const propertiesData = likedProperties.map(like => {
        let p = like.property.toJSON();
        return p;
    });

    await logRequest(
      req,
      {
        userId,
        status: 200,
        body: { success: true, message: "Wishlist fetched successfully", count },
        requestBodyLog
      },
      requestStartTime
    );

    return sendEncodedResponse(
      res,
      200,
      true,
      "Wishlist fetched successfully",
      propertiesData,
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

// Check if property is liked
const checkIfLiked = asyncHandler(async (req, res, next) => {
  const requestStartTime = Date.now();
  const { propertyId } = req.params;
  const userId = req.user.userId;

  try {
    const existingLike = await PropertyLike.findOne({
      where: { propertyId, userId }
    });

    return sendEncodedResponse(res, 200, true, "Checked like status", { isLiked: !!existingLike });
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  toggleLikeProperty,
  getWishlistProperties,
  checkIfLiked
};
