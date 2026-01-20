// middleware/uploadS3.js
const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const path = require("path");
const createAppError = require("../utils/appError");

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure multer-s3 storage
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME,
  acl: "public-read", // Make files publicly accessible
  contentType: multerS3.AUTO_CONTENT_TYPE, // Auto-detect content type
  metadata: (req, file, cb) => {
    cb(null, {
      fieldName: file.fieldname,
      uploadedBy: req.user?.userId || "anonymous",
      uploadDate: new Date().toISOString(),
    });
  },
  key: (req, file, cb) => {
    // Create organized folder structure
    const userId = req.user?.userId || "guest";
    const propertyId = req.params.propertyId || "new";
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);

    // Folder structure: properties/{userId}/{propertyId}/{type}/{filename}
    const mediaType = file.mimetype.startsWith("video/") ? "videos" : "photos";
    const fileName = `${baseName}-${timestamp}-${randomString}${ext}`;
    const s3Key = `properties/${userId}/${propertyId}/${mediaType}/${fileName}`;

    cb(null, s3Key);
  },
});

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

// Configure multer with S3 storage
const uploadS3 = multer({
  storage: s3Storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
    files: 10, // Maximum 10 files per upload
  },
  fileFilter: fileFilter,
});

module.exports = uploadS3;
