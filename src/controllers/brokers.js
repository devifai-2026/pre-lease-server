const { User, Role, BrokerProfile } = require("../models");
const { autoAssignRole } = require("../utils/roleHelper");
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

  const formattedBrokers = brokers.map((b) => {
    const profile = b.brokerProfile;
    return {
      id: b.userId,
      name: `${b.firstName} ${b.lastName}`,
      agentName: `${b.firstName} ${b.lastName}`,
      email: b.email,
      mobileNumber: b.mobileNumber,
      location: profile?.locality || "—",
      rera: b.reraNumber || "—",
      tags: profile?.specializations || [],
      propertiesListed: 0,
      dealsClosed: profile?.dealsClosed || 0,
      rating: 0,
      experience: "—",
      companyName: profile?.companyName || "—",
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

module.exports = { getBrokers, saveBrokerProfile, getBrokerProfile };
