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
  getHotProperties,
  getPropertyCounts,
} = require("../controllers/property");
const {
  createPropertyManagerNotes,
  approveOrEditNote,
  deleteNote,
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
  checkAdminOrSuperAdmin,
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

// ✅ Get property counts by category
router.get("/properties/counts", getPropertyCounts);

// ✅ Get properties assigned to logged-in Sales Manager/Executive
router.get(
  "/properties/assigned",
  authenticateUser,
  checkSalesPerson, // Only sales roles
  getAssignedProperties
);

// ✅ Get last 20 updated properties
router.get(
  "/get-hot-properties",
  authenticateUser,
  getHotProperties
);

// ✅ Get single property details
router.get("/properties/:propertyId", getPropertyById);

// ============================================
// INVESTOR NOTES (Investor Role)
// ============================================

// ✅ Create/Add notes for a property (Sales Exec / Admin)
router.post(
  "/properties/:propertyId/notes",
  authenticateUser,
  checkPermission("PROPERTY_NOTES"),
  createPropertyManagerNotes
);

// ✅ Approve / deny / edit a note by noteId (Admin / Super Admin only)
router.patch(
  "/notes/:noteId/review",
  authenticateUser,
  checkAdminOrSuperAdmin,
  approveOrEditNote
);

// ✅ Delete (soft delete) a note by noteId
// Admin/Super Admin: any note; Sales Exec: only own pending/denied; Owner: own notes
router.delete(
  "/notes/:noteId",
  authenticateUser,
  checkRole([
    "Admin",
    "Super Admin",
    "Sales Executive - Property Manager",
    "Owner",
  ]),
  deleteNote
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
    "Sales Executive - Client Dealer",
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
    "Sales Executive - Client Dealer",
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
