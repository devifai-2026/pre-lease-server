// routes/property.js
const express = require("express");
const router = express.Router();
const { createProperty, updateProperty } = require("../controllers/property");
const { authenticateUser } = require("../middlewares/auth");
const uploadS3 = require("../middlewares/uploadS3");

// Create property with optional S3 media upload
router.post(
  "/properties",
  authenticateUser,
  uploadS3.array("files", 10),
  createProperty
);

// Update property with optional new media
router.put(
  "/properties/:propertyId",
  authenticateUser,
  uploadS3.array("files", 10), // ✅ Added upload middleware
  updateProperty
);

module.exports = router;
