const express = require("express");
const router = express.Router();
const {
  createProperty,
  updateProperty,
  getAllAmenities,
  getAllCaretakers,
  compareProperties,
  getAllProperties,
  getAssignedProperties,
} = require("../controllers/property");
const {
  createInvestorNotes,
  getAllPropertiesWithNotes,
  getPropertyWithNotes,
} = require("../controllers/notes");
const {
  authenticateUser,
  checkPermission,
  checkSalesPerson,
  checkRole,
} = require("../middlewares/auth");
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

// ✅ Get properties assigned to logged-in Sales Manager/Executive
router.get(
  "/properties/assigned",
  authenticateUser,
  checkSalesPerson, // Only sales roles
  getAssignedProperties
);

// ============================================
// INVESTOR NOTES (Investor Role)
// ============================================

// ✅ Create/Add notes for a property (Investor only)
router.post(
  "/properties/:propertyId/notes",
  authenticateUser,
  checkRole(["Investor"]),
  createInvestorNotes
);

// ============================================
// SALES AGENT NOTES VIEWING (Sales Manager/Executive)
// ============================================

// ✅ Get all properties with investor notes (assigned to logged-in sales agent)
router.get(
  "/properties/investor-notes",
  authenticateUser,
  checkRole(["Sales Manager", "Sales Executive"]),
  getAllPropertiesWithNotes
);

// ✅ Get specific property with all investor notes (assigned to logged-in sales agent)
router.get(
  "/properties/:propertyId/investor-notes",
  authenticateUser,
  checkRole(["Sales Manager", "Sales Executive"]),
  getPropertyWithNotes
);

module.exports = router;
