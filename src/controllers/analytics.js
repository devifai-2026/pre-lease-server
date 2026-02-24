const {
  Property,
  PropertyVerificationLog,
  PropertyNotificationEvent,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");

/**
 * @desc    Get Admin Dashboard Analytics
 * @route   GET /api/v1/admin/analytics
 * @access  Private (Admin/Super Admin)
 */
const getAdminAnalytics = asyncHandler(async (req, res) => {
  const { timeframe } = req.query;
  
  // 1. Calculate Base Dates
  const baseDate = new Date();
  let trendMonths = 6;

  if (timeframe === "This Month") {
    baseDate.setDate(1);
    trendMonths = 1; // Actually we'll show weeks if possible, but keep months for now or just current month data
  } else if (timeframe === "This Year") {
    baseDate.setMonth(0);
    baseDate.setDate(1);
    trendMonths = new Date().getMonth() + 1;
  } else {
    // Default or Last 6 Months
    baseDate.setMonth(baseDate.getMonth() - 5);
    baseDate.setDate(1);
    trendMonths = 6;
  }
  baseDate.setHours(0, 0, 0, 0);

  // 2. Summary Card Stats (Currently global, optionally filter by timeframe)
  const propertyStats = await Property.findAll({
    attributes: [
      "isVerified",
      [sequelize.fn("COUNT", sequelize.col("property_id")), "count"],
    ],
    where: { isActive: true },
    group: ["isVerified"],
    raw: true,
  });

  const statsMap = {
    total: 0,
    partial: 0,
    pending: 0,
    completed: 0,
  };

  propertyStats.forEach((stat) => {
    const count = parseInt(stat.count, 10);
    statsMap.total += count;
    if (stat.isVerified === "partial") statsMap.partial = count;
    if (stat.isVerified === "pending") statsMap.pending = count;
    if (stat.isVerified === "completed") statsMap.completed = count;
  });

  // 3. Trend Data
  // Helper to get monthly buckets
  const getMonthlyBuckets = async (model, dateCol, whereClause = {}) => {
    return await model.findAll({
      attributes: [
        [sequelize.fn("DATE_TRUNC", "month", sequelize.col(dateCol)), "month"],
        [sequelize.fn("COUNT", sequelize.col("*")), "count"],
      ],
      where: {
        ...whereClause,
        [dateCol]: { [Op.gte]: baseDate },
      },
      group: [sequelize.fn("DATE_TRUNC", "month", sequelize.col(dateCol))],
      raw: true,
    });
  };

  const onboardingTrends = await getMonthlyBuckets(Property, "created_at", { isActive: true });
  const verifiedTrends = await getMonthlyBuckets(Property, "created_at", { isVerified: "completed", isActive: true });
  const partialTrends = await getMonthlyBuckets(Property, "created_at", { isVerified: "partial", isActive: true });
  const reassignmentTrends = await getMonthlyBuckets(PropertyNotificationEvent, "created_at", {
    notificationText: { [Op.iLike]: "%assigned%" },
  });

  // Combine Trends for Chart
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trendData = [];

  for (let i = trendMonths - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthIndex = d.getMonth();
    const monthName = months[monthIndex];
    const year = d.getFullYear();
    const matchStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    const findCount = (list, dateField = "month") => {
      const item = list.find(t => {
        const dStr = new Date(t[dateField]).toISOString().slice(0, 7);
        return dStr === matchStr;
      });
      return item ? parseInt(item.count) : 0;
    };

    trendData.push({
      month: monthName,
      onboarding: findCount(onboardingTrends),
      verified: findCount(verifiedTrends),
      partial: findCount(partialTrends),
      reassigned: findCount(reassignmentTrends)
    });
  }

  // 3. Quick Updates (Notifications)
  const quickUpdates = await PropertyNotificationEvent.findAll({
    limit: 5,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: Property,
        as: "property",
        attributes: ["propertyId", "microMarket", "city"]
      }
    ]
  });

  sendEncodedResponse(
    res,
    200,
    true,
    "Analytics fetched successfully",
    {
      summary: statsMap,
      trends: trendData,
      updates: quickUpdates.map(u => u.toJSON())
    }
  );
});

module.exports = {
  getAdminAnalytics
};
