const express = require("express");
const router = express.Router();
const { getBrokers, saveBrokerProfile, getBrokerProfile, getBrokerStats, contactBroker } = require("../controllers/brokers");
const { authenticateUser, checkBroker } = require("../middlewares/auth");
const { multerUpload } = require("../middlewares/uploadCloudinary");

/**
 * @route   GET /api/v1/brokers
 * @desc    Get all active brokers
 * @access  Public
 */
router.get("/brokers", getBrokers);

/**
 * @route   POST /api/v1/brokers/profile
 * @desc    Create or update broker's own profile (multipart/form-data with optional profilePhoto)
 * @access  Private (Broker only)
 */
router.post(
  "/brokers/profile",
  authenticateUser,
  checkBroker,
  multerUpload.single("profilePhoto"),
  saveBrokerProfile
);

/**
 * @route   GET /api/v1/brokers/profile
 * @desc    Get broker's own profile
 * @access  Private (Broker only)
 */
router.get("/brokers/profile", authenticateUser, checkBroker, getBrokerProfile);
router.get("/brokers/stats", authenticateUser, checkBroker, getBrokerStats);

/**
 * @route   POST /api/v1/brokers/contact/:brokerId
 * @desc    Send a contact enquiry to a specific broker
 * @access  Public
 */
router.post("/brokers/contact/:brokerId", contactBroker);

module.exports = router;
