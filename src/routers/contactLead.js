const express = require("express");
const router = express.Router();
const {
  createContactLead,
  getContactLeads,
  updateContactLead,
} = require("../controllers/contactLead");
const {
  authenticateUser,
  attachUserIfPresent,
  checkAdminOrSuperAdmin,
} = require("../middlewares/auth");

// Public submit (links to the user if a valid token is present, else guest)
router.post("/contact-leads", attachUserIfPresent, createContactLead);

// Admin: list + update status
router.get(
  "/admin/contact-leads",
  authenticateUser,
  checkAdminOrSuperAdmin,
  getContactLeads
);
router.patch(
  "/admin/contact-leads/:leadId",
  authenticateUser,
  checkAdminOrSuperAdmin,
  updateContactLead
);

module.exports = router;
