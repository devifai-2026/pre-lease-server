const multer = require("multer");
const path = require("path");
const cloudinary = require("../config/cloudinary");
const createAppError = require("../utils/appError");

// File filter - only accept images and videos
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|avi|mov|wmv|flv|mkv|webm/;

  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;

  // Check if it's an image
  if (
    mimetype.startsWith("image/") &&
    allowedImageTypes.test(extname.substring(1))
  ) {
    return cb(null, true);
  }

  // Check if it's a video
  if (
    mimetype.startsWith("video/") &&
    allowedVideoTypes.test(extname.substring(1))
  ) {
    return cb(null, true);
  }

  // Reject file
  cb(createAppError("Only image and video files are allowed!", 400));
};

// Configure multer with memory storage
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    files: 10,
  },
  fileFilter: fileFilter,
});

// Middleware to upload buffered files to Cloudinary
const uploadToCloudinary = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const userId = req.user?.userId || "guest";
        const propertyId = req.params.propertyId || "new";
        
        // Define folder structure in Cloudinary
        const mediaType = file.mimetype.startsWith("video/")
          ? "videos"
          : "photos";
        const folderPath = `properties/${userId}/${propertyId}/${mediaType}`;

        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: folderPath,
            resource_type: "auto", // Automatically detect if it's an image or video
            public_id: path.parse(file.originalname).name + "-" + Date.now(),
          },
          (error, result) => {
            if (error) {
              return reject(
                createAppError(
                  `Failed to upload ${file.originalname}: ${error.message}`,
                  500
                )
              );
            }
            // Set the Cloudinary URL on the file object
            // We reuse gcsPath property name for compatibility with existing controller
            // but also provide cloudinaryUrl for future-proofing
            file.cloudinaryUrl = result.secure_url;
            file.gcsPath = result.secure_url; // Compatibility with property controller
            file.public_id = result.public_id;
            resolve();
          }
        );

        uploadStream.end(file.buffer);
      });
    });

    await Promise.all(uploadPromises);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { multerUpload, uploadToCloudinary };
