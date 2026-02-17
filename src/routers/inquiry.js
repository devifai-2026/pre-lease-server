const express = require("express");
const router = express.Router();

const {
  createPropertyInquiry,
  getAssignedInquiries,
  getPendingInquiries,
  assignInquiry,
} = require("../controllers/propertyInquiries");

const {
  authenticateUser,
  checkPermission,
  checkSalesPerson,
  checkRole,
} = require("../middlewares/auth");

// ✅ Create new inquiry (investor/owner/broker creates from property inquiry)
router.post(
  "/inquiries/properties/:propertyId",
  authenticateUser,
  createPropertyInquiry
);

// ✅ Get pending/unassigned inquiries (Admin dashboard)
router.get(
  "/admin/pending-inquiries",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  getPendingInquiries
);

// ✅ Get assigned inquiries (Sales Executive - Client Dealer)
router.get(
  "/sales/assigned-inquiries",
  authenticateUser,
  checkRole(["Sales Executive - Client Dealer"]),
  getAssignedInquiries
);

// ✅  assigning inquiries (Admin,Super admin)
router.post(
  "/admin/inquiries/assign",
  authenticateUser,
  checkRole(["Admin", "Super Admin"]),
  assignInquiry
);

module.exports = router;
