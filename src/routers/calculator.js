const express = require("express");
const router = express.Router();
const { calculatePLG } = require("../controllers/calculator");
const { authenticateUser } = require("../middlewares/auth");

router.post("/calculator/plg", authenticateUser, calculatePLG);

module.exports = router;
