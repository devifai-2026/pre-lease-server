const { Op } = require("sequelize");
const { sequelize } = require("../config/dbConnection");
const { User, Role, BrokerProfile } = require("../models");
const { autoAssignRole } = require("../utils/roleHelper");
const { isValidEmail, isValidPhone } = require("../utils/validators");
const asyncHandler = require("../utils/asyncHandler");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const createAppError = require("../utils/appError");
const cloudinary = require("../config/cloudinary");

/**
 * Upload a single image buffer to Cloudinary under broker-profiles folder.
 * Returns the secure URL string.
 */
const uploadProfilePhotoToCloudinary = (file, userId) => {
  return new Promise((resolve, reject) => {
    const folderPath = `broker-profiles/${userId}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folderPath,
        resource_type: "image",
        public_id: `profile-${Date.now()}`,
        transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
};

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
        where: { roleName: "Broker", isActive: true },
        through: { attributes: [] },
      },
      {
        model: BrokerProfile,
        as: "brokerProfile",
        required: false,
      },
    ],
    attributes: ["userId", "firstName", "lastName", "email", "mobileNumber", "reraNumber", "createdAt"],
    order,
    limit: limitNum,
    offset,
    distinct: true,
  });

  const totalPages = Math.ceil(count / limitNum);

  // Real properties-listed count per broker (was hardcoded 0).
  const { Property } = require("../models");
  const brokerIds = brokers.map((b) => b.userId);
  const listingCounts = {};
  if (brokerIds.length) {
    const counts = await Property.findAll({
      where: { brokerId: { [Op.in]: brokerIds }, isActive: true },
      attributes: [
        "brokerId",
        [sequelize.fn("COUNT", sequelize.col("property_id")), "cnt"],
      ],
      group: ["brokerId"],
      raw: true,
    });
    counts.forEach((c) => {
      listingCounts[c.brokerId] = parseInt(c.cnt, 10) || 0;
    });
  }

  const formattedBrokers = brokers.map((b) => {
    const profile = b.brokerProfile;
    return {
      id: b.userId,
      name: `${b.firstName} ${b.lastName}`,
      agentName: `${b.firstName} ${b.lastName}`,
      email: b.email,
      mobileNumber: b.mobileNumber,
      location: profile?.locality || null,
      rera: b.reraNumber || null,
      tags: profile?.specializations || [],
      propertiesListed: listingCounts[b.userId] || 0,
      dealsClosed: profile?.dealsClosed || 0,
      // No rating/experience data source exists yet — return null so the UI shows
      // "N/A" rather than a fabricated 0 / "—".
      rating: null,
      experience: null,
      companyName: profile?.companyName || null,
      profilePhoto: profile?.profilePhoto || null,
      hasProfile: !!profile,
    };
  });

  return sendEncodedResponse(res, 200, true, "Brokers fetched successfully", formattedBrokers, {
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalCount: count,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    },
  });
});

const saveBrokerProfile = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;

  // Fields come from either JSON body or multipart form fields
  const companyName = req.body.companyName;
  const locality = req.body.locality;
  const dealsClosed = req.body.dealsClosed;

  // specializations may be sent as a JSON string (FormData) or as an array (JSON body)
  let specializations = req.body.specializations;
  if (typeof specializations === "string") {
    try {
      specializations = JSON.parse(specializations);
    } catch {
      specializations = specializations.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!locality || !String(locality).trim()) {
    throw createAppError("Locality is required", 400);
  }
  if (!specializations || !Array.isArray(specializations) || specializations.length === 0) {
    throw createAppError("At least one specialization is required", 400);
  }
  if (dealsClosed === undefined || dealsClosed === null || dealsClosed === "") {
    throw createAppError("Deals closed is required", 400);
  }

  // Upload profile photo to Cloudinary if a file was provided
  let profilePhotoUrl = undefined;
  if (req.file) {
    try {
      profilePhotoUrl = await uploadProfilePhotoToCloudinary(req.file, userId);
    } catch (uploadErr) {
      throw createAppError("Failed to upload profile photo: " + uploadErr.message, 500);
    }
  }

  const existing = await BrokerProfile.findOne({ where: { userId } });

  const profileData = {
    companyName: companyName || null,
    locality: String(locality).trim(),
    specializations,
    dealsClosed: parseInt(dealsClosed) || 0,
    ...(profilePhotoUrl !== undefined && { profilePhoto: profilePhotoUrl }),
  };

  let profile;
  if (existing) {
    await existing.update(profileData);
    profile = existing;
  } else {
    profile = await BrokerProfile.create({ userId, ...profileData });
  }

  // Auto-assign Broker role if user doesn't already have it
  // (covers the case where an investor-joined user later completes a broker profile)
  await autoAssignRole(userId, "Broker", "broker_profile_completed");

  return sendEncodedResponse(
    res,
    existing ? 200 : 201,
    true,
    existing ? "Broker profile updated successfully" : "Broker profile created successfully",
    {
      profileId: profile.profileId,
      userId: profile.userId,
      companyName: profile.companyName,
      locality: profile.locality,
      specializations: profile.specializations,
      dealsClosed: profile.dealsClosed,
      profilePhoto: profile.profilePhoto,
    }
  );
});

const getBrokerProfile = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;
  const profile = await BrokerProfile.findOne({ where: { userId } });

  return sendEncodedResponse(res, 200, true, "Broker profile fetched successfully",
    profile
      ? {
          profileId: profile.profileId,
          userId: profile.userId,
          companyName: profile.companyName,
          locality: profile.locality,
          specializations: profile.specializations,
          dealsClosed: profile.dealsClosed,
          profilePhoto: profile.profilePhoto,
        }
      : null
  );
});

const getBrokerStats = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;
  const { Property, PropertyInquiry } = require("../models");

  const activeListings = await Property.count({
    where: { brokerId: userId, isActive: true },
  });

  // For this demo/flow, "Active Deals" could be inquiries on their properties
  const activeDeals = await PropertyInquiry.count({
    include: [
      {
        model: Property,
        as: "property",
        where: { brokerId: userId },
      },
    ],
  });

  // Conversion rate = closed deals / total inquiries (real computation, no mock).
  const profile = await BrokerProfile.findOne({ where: { userId } });
  const dealsClosed = profile?.dealsClosed || 0;
  const conversionRate =
    activeDeals > 0
      ? `${Math.round((dealsClosed / activeDeals) * 100)}%`
      : "0%";

  return sendEncodedResponse(res, 200, true, "Broker stats fetched successfully", {
    activeDeals,
    activeListings,
    conversionRate,
  });
});

const contactBroker = asyncHandler(async (req, res, next) => {
  const { brokerId } = req.params;
  const { fullName, email, phoneNumber, propertyType, budgetRange, timeline, additionalNotes } = req.body;

  if (!fullName || !email || !phoneNumber || !propertyType || !budgetRange || !timeline) {
    throw createAppError("fullName, email, phoneNumber, propertyType, budgetRange, and timeline are required", 400);
  }

  // Validate the submitted contact details (was previously accepted unvalidated).
  if (!isValidEmail(email)) {
    throw createAppError("Invalid email format", 400);
  }
  if (!isValidPhone(phoneNumber)) {
    throw createAppError("Invalid mobile number. Must be 10 digits starting with 6-9", 400);
  }

  const broker = await User.findOne({
    where: { userId: brokerId, isActive: true, deletedAt: null },
    include: [
      {
        model: Role,
        as: "roles",
        where: { roleName: "Broker", isActive: true },
        through: { attributes: [] },
      },
    ],
  });

  if (!broker) {
    throw createAppError("Broker not found", 404);
  }

  // NOTE: there is no messaging/persistence layer yet, so we record the contact as a
  // notification to the broker (closest existing channel) rather than silently dropping it.
  const { PropertyNotificationEvent } = require("../models");
  await PropertyNotificationEvent.create({
    userId: brokerId,
    title: "New contact request",
    notificationText: `${fullName} (${phoneNumber}, ${email}) is interested in ${propertyType}, budget ${budgetRange}, timeline ${timeline}.${additionalNotes ? " Notes: " + additionalNotes : ""}`,
  }).catch(() => {}); // best-effort; do not fail the request if notif insert fails

  // Use the standard encoded response (was a raw res.json — inconsistent decoder).
  return sendEncodedResponse(res, 200, true, "Your contact request has been forwarded to the broker.", {
      brokerId,
      fullName,
      email,
      phoneNumber,
      propertyType,
      budgetRange,
      timeline,
      additionalNotes: additionalNotes || null,
  });
});

module.exports = {
  getBrokers,
  saveBrokerProfile,
  getBrokerProfile,
  getBrokerStats,
  contactBroker,
};
