const { User, Role } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { Op } = require("sequelize");

const getBrokers = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, sortBy = "name_asc" } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const order = [];
  if (sortBy === "name_asc") {
    order.push(["firstName", "ASC"]);
    order.push(["lastName", "ASC"]);
  } else {
    // Default to name_asc or handle other sorts if needed
    order.push(["createdAt", "DESC"]);
  }

  const { count, rows: brokers } = await User.findAndCountAll({
    where: {
      isActive: true,
      deletedAt: null,
    },
    include: [
      {
        model: Role,
        as: "roles",
        where: {
          roleName: "Broker",
          isActive: true,
        },
        through: { attributes: [] },
      },
    ],
    attributes: ["userId", "firstName", "lastName", "email", "mobileNumber", "createdAt"],
    order,
    limit: limitNum,
    offset,
    distinct: true,
  });

  const totalPages = Math.ceil(count / limitNum);

  const formattedBrokers = brokers.map((b) => ({
    id: b.userId,
    name: `${b.firstName} ${b.lastName}`,
    agentName: `${b.firstName} ${b.lastName}`, // Used in the card
    email: b.email,
    mobileNumber: b.mobileNumber,
    location: "Bangalore, India", // Placeholder or from a profile table if available
    rera: "PRM/KA/RERA/1251/446/AG/171114/000000", // Placeholder
    tags: ["Residential", "Commercial", "Plots"], // Default to prevent map error
    propertiesListed: 12,
    dealsClosed: 8,
    rating: 4.8,
    experience: "8 years",
  }));

  const pagination = {
    currentPage: pageNum,
    totalPages,
    totalCount: count,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1,
  };

  return sendEncodedResponse(
    res,
    200,
    true,
    "Brokers fetched successfully",
    formattedBrokers,
    { pagination }
  );
});

module.exports = {
  getBrokers,
};
