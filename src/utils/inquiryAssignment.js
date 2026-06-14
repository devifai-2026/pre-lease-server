// Shared helpers for enquiry auto-assignment + default stage, used by both the
// create-inquiry flow and the manual auto-assign endpoint so the rules stay
// identical in one place.
const { Op } = require("sequelize");
const {
  User,
  Role,
  PropertyInquiry,
  InquiryStage,
} = require("../models");
const { sequelize } = require("../config/dbConnection");

const CLIENT_DEALER_ROLE = "Sales Executive - Client Dealer";

// The first active stage by sort order = the default "New" stage.
async function getDefaultStage(transaction) {
  return InquiryStage.findOne({
    where: { isActive: true },
    order: [["sortOrder", "ASC"]],
    transaction,
  });
}

// Pick the least-loaded ACTIVE Client Dealer (load balancing). Counts every
// inquiry currently assigned to each dealer; the one with the fewest wins.
// Dealers with zero assignments naturally win (count defaults to 0).
// Returns a userId, or null if there are no active Client Dealers.
async function pickLeastLoadedDealer(transaction) {
  const dealers = await User.findAll({
    where: { isActive: true },
    attributes: ["userId"],
    include: [
      {
        model: Role,
        as: "roles",
        through: { attributes: [] },
        where: { roleName: CLIENT_DEALER_ROLE, isActive: true },
        attributes: [],
      },
    ],
    transaction,
  });

  const dealerIds = dealers.map((d) => d.userId);
  if (dealerIds.length === 0) return null;

  const counts = await PropertyInquiry.findAll({
    where: { assignedTo: { [Op.in]: dealerIds } },
    attributes: [
      "assignedTo",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["assignedTo"],
    raw: true,
    transaction,
  });

  const countMap = {};
  counts.forEach((r) => {
    countMap[r.assignedTo] = parseInt(r.count, 10) || 0;
  });

  return dealerIds.reduce((bestId, id) => {
    const c = countMap[id] || 0;
    const best = countMap[bestId] || 0;
    return c < best ? id : bestId;
  }, dealerIds[0]);
}

// Sticky routing: keep an inquirer talking to the SAME Client Dealer they were
// first assigned, so the dealer accumulates context across all that client's
// enquiries (any property, broker or investor). We anchor on the FIRST-EVER
// assignment (oldest assignedAt), ignoring later admin reassignments.
// Returns the dealer's userId if they're still active AND still a Client Dealer,
// otherwise null (caller should fall back to load balancing).
async function findStickyDealer(inquirerId, excludeInquiryId, transaction) {
  const firstAssigned = await PropertyInquiry.findOne({
    where: {
      inquirerId, // same CLIENT across any property
      assignedTo: { [Op.not]: null },
      ...(excludeInquiryId ? { id: { [Op.ne]: excludeInquiryId } } : {}),
    },
    attributes: ["assignedTo"],
    // Oldest first → the first dealer this client ever had.
    order: [["assignedAt", "ASC"]],
    transaction,
  });

  if (!firstAssigned) return null;

  // The original dealer must still be active AND still hold the Client Dealer
  // role; otherwise the sticky link is stale and we re-balance instead.
  const stillValid = await User.findOne({
    where: { userId: firstAssigned.assignedTo, isActive: true },
    attributes: ["userId"],
    include: [
      {
        model: Role,
        as: "roles",
        where: { roleName: CLIENT_DEALER_ROLE, isActive: true },
        required: true,
        through: { attributes: [] },
        attributes: [],
      },
    ],
    transaction,
  });

  return stillValid ? firstAssigned.assignedTo : null;
}

module.exports = {
  getDefaultStage,
  pickLeastLoadedDealer,
  findStickyDealer,
  CLIENT_DEALER_ROLE,
};
