// middleware/uploadGCS.js
const multer = require("multer");
const path = require("path");
const createAppError = require("../utils/appError");
const { bucket } = require("../config/gcsClient");

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

// Configure multer with memory storage (files buffered in memory before GCS upload)
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    files: 10, // Maximum 10 files per upload
  },
  fileFilter: fileFilter,
});

// Middleware to upload buffered files to GCS
const uploadToGCS = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const userId = req.user?.userId || "guest";
        const propertyId = req.params.propertyId || "new";
        const timestamp = Date.now();
        const randomString = Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);

        // Folder structure: properties/{userId}/{propertyId}/{type}/{filename}
        const mediaType = file.mimetype.startsWith("video/")
          ? "videos"
          : "photos";
        const fileName = `${baseName}-${timestamp}-${randomString}${ext}`;
        const gcsPath = `properties/${userId}/${propertyId}/${mediaType}/${fileName}`;

        const blob = bucket.file(gcsPath);
        const blobStream = blob.createWriteStream({
          resumable: false,
          contentType: file.mimetype,
          metadata: {
            metadata: {
              fieldName: file.fieldname,
              uploadedBy: req.user?.userId || "anonymous",
              uploadDate: new Date().toISOString(),
            },
          },
        });

        blobStream.on("error", (err) => {
          reject(
            createAppError(`Failed to upload ${file.originalname}: ${err.message}`, 500)
          );
        });

        blobStream.on("finish", () => {
          // Set the GCS path on the file object so the controller can store it
          file.gcsPath = gcsPath;
          resolve();
        });

        blobStream.end(file.buffer);
      });
    });

    await Promise.all(uploadPromises);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { multerUpload, uploadToGCS };
