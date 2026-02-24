const express = require("express");
const router = express.Router();
const { getAdminAnalytics } = require("../controllers/analytics");
const { authenticateUser, checkOperationalStaff } = require("../middlewares/auth");

router.get("/analytics", authenticateUser, checkOperationalStaff, getAdminAnalytics);

module.exports = router;
