const express = require("express");
const router = express.Router();
const {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties, // ✅ Add import
} = require("../controllers/property");
const { authenticateUser, checkPermission } = require("../middlewares/auth");
const uploadS3 = require("../middlewares/uploadS3");

// ============================================
// PROPERTY CRUD OPERATIONS
// ============================================

// ✅ Create property
router.post(
  "/properties",
  authenticateUser,
  checkPermission("PROPERTY_CREATE"),
  uploadS3.array("files", 10),
  createProperty
);

// ✅ Update property
router.put(
  "/properties/:propertyId",
  authenticateUser,
  checkPermission("PROPERTY_UPDATE"),
  uploadS3.array("files", 10),
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

module.exports = router;
