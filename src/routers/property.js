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
  getPropertyById,
} = require("../controllers/property");
const {
  createPropertyManagerNotes,
  getAllPropertiesWithNotes,
  getPropertyWithNotes,
  getPropertyNotesByOwner,
  getAllOwnerNotes,
  addOwnerNoteForProperty,
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

// ✅ Get single property details
router.get("/properties/:propertyId", getPropertyById);

// ============================================
// INVESTOR NOTES (Investor Role)
// ============================================

// ✅ Create/Add notes for a property (Investor only)
router.post(
  "/properties/:propertyId/notes",
  authenticateUser,
  checkPermission("PROPERTY_NOTES"),
  createPropertyManagerNotes
);

// ============================================
// SALES AGENT NOTES VIEWING (Sales Manager/Executive)
// ============================================

// ✅ Get all properties with investor notes (assigned to logged-in sales agent)
router.get(
  "/notes/properties",
  authenticateUser,
  checkRole([
    "Admin",
    "Super Admin",
    "Sales Manager",
    "Sales Executive - Property Manager",
  ]),
  getAllPropertiesWithNotes
);

// ✅ Get specific property with all investor notes (assigned to logged-in sales agent)
router.get(
  "/notes/:propertyId",
  authenticateUser,
  checkRole([
    "Admin",
    "Super Admin",
    "Sales Manager",
    "Sales Executive - Property Manager",
  ]),
  getPropertyWithNotes
);

// ============================================
// OWNER: VIEW NOTES ON THEIR OWN PROPERTY
// ============================================

// ✅ Owner can see notes added by the sales exec on their property
router.get(
  "/owner/properties/:propertyId/notes",
  authenticateUser,
  checkRole(["Owner"]),
  getPropertyNotesByOwner
);

// ✅ Owner can see all notes for all their properties
router.get(
  "/owner/notes",
  authenticateUser,
  checkRole(["Owner"]),
  getAllOwnerNotes
);

// ✅ Owner can add notes to their property
router.post(
  "/owner/properties/:propertyId/notes",
  authenticateUser,
  checkRole(["Owner"]),
  addOwnerNoteForProperty
);

module.exports = router;
