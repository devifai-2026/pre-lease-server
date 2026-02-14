const express = require("express");
const router = express.Router();
const {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties,
  getAllProperties,
} = require("../controllers/property");
const { authenticateUser, checkPermission } = require("../middlewares/auth");
const { multerUpload, uploadToGCS } = require("../middlewares/uploadGCS");

// ============================================
// PROPERTY CRUD OPERATIONS
// ============================================

// ✅ Create property
router.post(
  "/properties",
  authenticateUser,
  checkPermission("PROPERTY_CREATE"),
  multerUpload.array("files", 10),
  uploadToGCS,
  createProperty
);

// ✅ Update property
router.put(
  "/properties/:propertyId",
  authenticateUser,
  checkPermission("PROPERTY_UPDATE"),
  multerUpload.array("files", 10),
  uploadToGCS,
  updateProperty
);

// ============================================
// PUBLIC APIS (NO AUTHENTICATION)
// ============================================

// ✅ Compare properties (public access)
router.get("/properties/compare", compareProperties);

// ============================================
// LOOKUP APIS
// ============================================

// ✅ Get all amenities for dropdown
router.get("/amenities", authenticateUser, getAllAmenities);

// ✅ Get all caretakers for dropdown
router.get("/caretakers", authenticateUser, getAllCaretakers);

// ✅ Get all properties with some filters
router.get("/properties", getAllProperties);

module.exports = router;
