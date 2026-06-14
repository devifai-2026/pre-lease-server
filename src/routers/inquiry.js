const express = require("express");
const router = express.Router();

const {
  createPropertyInquiry,
  getAssignedInquiries,
  getPendingInquiries,
  assignInquiry,
  autoAssignInquiry,
  getMyInquiries,
  getInquiryById,
} = require("../controllers/propertyInquiries");

const {
  getStages,
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
  updateInquiryStage,
  getInquiryHistory,
  getEnquiryReport,
} = require("../controllers/inquiryStages");

const {
  postMessage,
  reviewMessage,
  getMessages,
  getPendingMessages,
  getPendingMessagesCount,
} = require("../controllers/inquiryMessages");

const { authenticateUser, checkRole } = require("../middlewares/auth");

const SALES_ROLES = [
  "Admin",
  "Super Admin",
  "Sales Manager",
  "Sales Executive - Property Manager",
  "Sales Executive - Client Dealer",
];
const ADMIN_ROLES = ["Admin", "Super Admin"];

// ✅ Create new inquiry (investor/owner/broker creates from property inquiry)
router.post(
  "/inquiries/properties/:propertyId",
  authenticateUser,
  createPropertyInquiry
);
 
// ✅ Get inquiries by logged-in user
router.get(
  "/my-inquiries",
  authenticateUser,
  getMyInquiries
);

// ✅ Get enquiry details by ID
router.get(
  "/inquiries/:id",
  authenticateUser,
  getInquiryById
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

// ── Enquiry pipeline STAGE CONFIG (admin advanced settings) ──────────────
// List stages — any sales role (needed to render the stage picker).
router.get("/inquiry-stages", authenticateUser, checkRole(SALES_ROLES), getStages);
// Create / update / reorder / delete — admins only.
router.post("/inquiry-stages", authenticateUser, checkRole(ADMIN_ROLES), createStage);
router.put("/inquiry-stages/reorder", authenticateUser, checkRole(ADMIN_ROLES), reorderStages);
router.put("/inquiry-stages/:stageId", authenticateUser, checkRole(ADMIN_ROLES), updateStage);
router.delete("/inquiry-stages/:stageId", authenticateUser, checkRole(ADMIN_ROLES), deleteStage);

// ── Move an enquiry through the pipeline (+ optional note) ───────────────
router.put(
  "/inquiries/:inquiryId/stage",
  authenticateUser,
  checkRole(SALES_ROLES),
  updateInquiryStage
);
// Enquiry stage-change timeline
router.get(
  "/inquiries/:inquiryId/history",
  authenticateUser,
  checkRole(SALES_ROLES),
  getInquiryHistory
);

// ── Enquiry Report (with stage history + score) ─────────────────────────
router.get(
  "/reports/enquiries",
  authenticateUser,
  checkRole(SALES_ROLES),
  getEnquiryReport
);

// ── Enquiry message thread (dealer <-> inquirer, admin-approved) ─────────
// Post / list are open to any authenticated user; the controller enforces that
// the requester is the assigned dealer, the inquirer, or an admin/manager.
router.get("/inquiries/:inquiryId/messages", authenticateUser, getMessages);
router.post("/inquiries/:inquiryId/messages", authenticateUser, postMessage);
// Approve / decline a pending dealer message — admins/managers only.
router.put(
  "/inquiry-messages/:messageId/review",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  reviewMessage
);

// Pending dealer messages awaiting approval (queue + count) — admins/managers.
router.get(
  "/inquiry-messages/pending",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  getPendingMessages
);
router.get(
  "/inquiry-messages/pending/count",
  authenticateUser,
  checkRole(["Admin", "Super Admin", "Sales Manager"]),
  getPendingMessagesCount
);

module.exports = router;
