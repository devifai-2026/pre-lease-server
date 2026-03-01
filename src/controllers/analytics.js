const {
  Property,
  PropertyVerificationLog,
  PropertyNotificationEvent,
  User,
  Role,
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
  const userId = req.user.userId;

  // 1. Calculate Base Dates
  const now = new Date();
  const baseDate = new Date();
  let trendMonths = 6;

  if (timeframe === "This Month") {
    baseDate.setDate(1);
    trendMonths = 1;
  } else if (timeframe === "This Year") {
    baseDate.setMonth(0);
    baseDate.setDate(1);
    trendMonths = now.getMonth() + 1;
  } else {
    baseDate.setMonth(baseDate.getMonth() - 5);
    baseDate.setDate(1);
    trendMonths = 6;
  }
  baseDate.setHours(0, 0, 0, 0);

  // Previous month range for comparisons
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // 1.5 Role-based filtering
  const propertySearchWhere = { isActive: true };
  if (req.user.role === "Sales Executive - Property Manager") {
    propertySearchWhere.salesId = userId;
  }

  // 2. Summary Card Stats
  const propertyStats = await Property.findAll({
    attributes: [
      ["is_verified", "isVerified"],
      [sequelize.fn("COUNT", sequelize.col("property_id")), "count"],
    ],
    where: propertySearchWhere,
    group: ["is_verified"],
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

  // 3. Average Days to Verify & Comparison
  const getAvgDays = async (startDate, endDate) => {
    const where = { 
      isVerified: 'completed', 
      isActive: true 
    };
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [startDate, endDate] };
    }

    const data = await sequelize.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (v.max_created_at - p.created_at)) / 86400) as avg_days
      FROM properties p
      JOIN (
        SELECT property_id, MAX(created_at) as max_created_at
        FROM property_verification_logs
        GROUP BY property_id
      ) v ON p.property_id = v.property_id
      WHERE p.is_verified = 'completed' AND p.is_active = true
      ${req.user.role === "Sales Executive - Property Manager" ? `AND p.sales_id = '${userId}'` : ""}
      ${startDate ? `AND p.created_at >= '${startDate.toISOString()}'` : ""}
      ${endDate ? `AND p.created_at <= '${endDate.toISOString()}'` : ""}
    `, { type: sequelize.QueryTypes.SELECT });
    return data[0]?.avg_days ? parseFloat(data[0].avg_days) : 0;
  };

  const currentAvgDays = await getAvgDays();
  const prevMonthAvgDays = await getAvgDays(prevMonthStart, prevMonthEnd);
  const diffAvgDays = (prevMonthAvgDays - currentAvgDays).toFixed(1);
  const isFaster = parseFloat(diffAvgDays) >= 0;

  // 4. Executive Ranking
  // 4. Executive Ranking - strictly for 'Sales Executive - Property Manager' role
  const allRankings = await User.findAll({
    attributes: [
      ["first_name", "firstName"],
      ["last_name", "lastName"],
      ["user_id", "userId"],
      [sequelize.fn("COUNT", sequelize.col("verificationLogs.id")), "props"],
    ],
    where: { isActive: true },
    include: [
      {
        model: Role,
        as: "roles",
        where: {
          roleName: "Sales Executive - Property Manager",
        },
        attributes: [],
        through: { attributes: [] },
        required: true, // Inner Join: Only return users with this exact role
      },
      {
        model: PropertyVerificationLog,
        as: "verificationLogs",
        attributes: [],
        required: false, // Left Join: Include managers with 0 verified properties
      },
    ],
    group: [
      sequelize.col("User.user_id"),
      sequelize.col("User.first_name"),
      sequelize.col("User.last_name"),
    ],
    order: [[sequelize.literal("props"), "DESC"]],
    raw: true,
  });

  const topRanking = allRankings.slice(0, 5).map((r, idx) => ({
    name: `${r.firstName} ${r.lastName}`,
    props: parseInt(r.props || 0),
    userId: r.userId,
    icon:
      idx === 0
        ? "👑"
        : idx === 1
          ? "🥈"
          : idx === 2
            ? "🥉"
            : (idx + 1).toString(),
  }));

  const userRankIndex = allRankings.findIndex((r) => r.userId === userId);
  const userRankInfo =
    userRankIndex !== -1
      ? {
          rank: userRankIndex + 1,
          props: parseInt(allRankings[userRankIndex].props || 0),
          propsToNext:
            userRankIndex > 0
              ? parseInt(allRankings[userRankIndex - 1].props || 0) -
                parseInt(allRankings[userRankIndex].props || 0)
              : 0,
        }
      : { rank: "N/A", props: 0, propsToNext: 0 };

  // 5. Properties by Location
  const locationStatsRaw = await Property.findAll({
    attributes: [
      ["micro_market", "microMarket"],
      [sequelize.fn("COUNT", sequelize.col("property_id")), "count"],
    ],
    where: propertySearchWhere,
    group: ["micro_market"],
    order: [[sequelize.literal("count"), "DESC"]],
    limit: 4,
    raw: true
  });

  const totalPropsCount = statsMap.total || 1;
  const locationColors = ["bg-red-500", "bg-orange-500", "bg-green-600", "bg-red-400"];
  const locations = locationStatsRaw.map((loc, idx) => ({
    name: loc.microMarket || "Unknown",
    count: parseInt(loc.count),
    percentage: Math.round((parseInt(loc.count) / totalPropsCount) * 100),
    color: locationColors[idx % locationColors.length]
  }));

  // 6. Trend Data
  const getTrendBuckets = async (
    model,
    dateCol,
    granularity,
    whereClause = {},
    include = [],
  ) => {
    const trunc = granularity === "day" ? "day" : "month";
    const qualifiedCol = `${model.name}.${dateCol}`;

    return await model.findAll({
      attributes: [
        [
          sequelize.fn("DATE_TRUNC", trunc, sequelize.col(qualifiedCol)),
          "timeLabel",
        ],
        [sequelize.fn("COUNT", sequelize.col("*")), "count"],
      ],
      where: {
        ...whereClause,
        [`$${qualifiedCol}$`]: { [Op.gte]: baseDate },
      },
      include,
      group: [sequelize.fn("DATE_TRUNC", trunc, sequelize.col(qualifiedCol))],
      raw: true,
    });
  };

  const gran = timeframe === "This Month" ? "day" : "month";
  const onboardingTrends = await getTrendBuckets(Property, "created_at", gran, propertySearchWhere);
  const verifiedTrends = await getTrendBuckets(Property, "created_at", gran, { ...propertySearchWhere, isVerified: "completed" });
  const partialTrends = await getTrendBuckets(Property, "created_at", gran, { ...propertySearchWhere, isVerified: "partial" });
  const reassignmentTrends = await getTrendBuckets(
    PropertyNotificationEvent,
    "created_at",
    gran,
    { notificationText: { [Op.iLike]: "%assigned%" } },
    req.user.role === "Sales Executive - Property Manager"
      ? [
          {
            model: Property,
            as: "property",
            where: { salesId: userId },
            attributes: [],
          },
        ]
      : [],
  );

  const trendData = [];
  const itemsCount = timeframe === "This Month" ? 30 : trendMonths;
  
  for (let i = itemsCount - 1; i >= 0; i--) {
    const d = new Date();
    if (gran === 'day') d.setDate(d.getDate() - i);
    else d.setMonth(d.getMonth() - i);
    
    const label = gran === 'day' ? d.getDate().toString() : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
    const matchStr = gran === 'day' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7);

    const find = (list) => {
      const item = list.find(t => new Date(t.timeLabel).toISOString().slice(0, gran === 'day' ? 10 : 7) === matchStr);
      return item ? parseInt(item.count) : 0;
    };

    trendData.push({
      month: label,
      onboarding: find(onboardingTrends),
      verified: find(verifiedTrends),
      partial: find(partialTrends),
      reassigned: find(reassignmentTrends)
    });
  }

  // 7. Quick Updates
  const quickUpdates = await PropertyNotificationEvent.findAll({
    limit: 10,
    order: [["createdAt", "DESC"]],
    include: [{ model: Property, as: "property", attributes: ["propertyId", "microMarket", "city"] }]
  });

  sendEncodedResponse(res, 200, true, "Analytics fetched successfully", {
    summary: statsMap,
    trends: trendData,
    updates: quickUpdates.map(u => u.toJSON()),
    ranking: topRanking,
    userRank: userRankInfo,
    locations,
    verificationMetrics: {
      avgDays: currentAvgDays.toFixed(1),
      diff: Math.abs(parseFloat(diffAvgDays)),
      isFaster,
      target: 5.0
    }
  });
});

module.exports = {
  getAdminAnalytics
};
