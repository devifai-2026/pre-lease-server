const express = require("express");
const router = express.Router();
const { getBrokers } = require("../controllers/brokers");

/**
 * @route   GET /api/v1/brokers
 * @desc    Get all active brokers (client role)
 * @access  Public
 */
router.get("/brokers", getBrokers);

module.exports = router;
