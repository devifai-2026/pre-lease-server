const express = require("express");
const router = express.Router();
const { calculatePLG, generateReport } = require("../controllers/calculator");
const { authenticateUser } = require("../middlewares/auth");

router.post("/calculator/plg", authenticateUser, calculatePLG);
router.post("/calculator/plg/report", authenticateUser, generateReport);

module.exports = router;
