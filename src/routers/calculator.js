const express = require("express");
const router = express.Router();
const { calculatePLG, generateReport } = require("../controllers/calculator");

// Public calculator endpoints — no authentication required so anyone can run
// the ROI / rental-yield calculation without logging in.
router.post("/calculator/plg", calculatePLG);
router.post("/calculator/plg/report", generateReport);

module.exports = router;
