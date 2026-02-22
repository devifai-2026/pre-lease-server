const express = require("express");
const router = express.Router();

const {
  createPropertyInquiry,
  getAssignedInquiries,
  getPendingInquiries,
  assignInquiry,
  autoAssignInquiry,
} = require("../controllers/propertyInquiries");

const { authenticateUser, checkRole } = require("../middlewares/auth");

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
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  getPendingInquiries
);

// ✅ Get assigned inquiries (any role that can be assigned an inquiry)
router.get(
  "/sales/assigned-inquiries",
  authenticateUser,
  checkRole([
    "Admin",
    "Super Admin",
    "Sales Manager",
    "Sales Executive - Property Manager",
    "Sales Executive - Client Dealer",
  ]),
  getAssignedInquiries
);

// ✅  assigning inquiries (Sales Manager, Admin, Super Admin)
router.post(
  "/admin/inquiries/assign",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  assignInquiry
);

// ✅  auto-assigning inquiries (Sales Manager, Admin, Super Admin)
router.post(
  "/admin/inquiries/auto-assign",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  autoAssignInquiry
);

module.exports = router;
