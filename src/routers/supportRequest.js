const express = require("express");
const router = express.Router();
const {
  createSupportRequest,
  getSupportRequests,
  updateSupportRequest,
} = require("../controllers/supportRequest");
const {
  authenticateUser,
  attachUserIfPresent,
  checkAdminOrSuperAdmin,
} = require("../middlewares/auth");

// Public submit (links to the user if a valid token is present, else guest)
router.post("/support-requests", attachUserIfPresent, createSupportRequest);

// Admin: list + update status
router.get(
  "/admin/support-requests",
  authenticateUser,
  checkAdminOrSuperAdmin,
  getSupportRequests
);
router.patch(
  "/admin/support-requests/:requestId",
  authenticateUser,
  checkAdminOrSuperAdmin,
  updateSupportRequest
);

module.exports = router;
