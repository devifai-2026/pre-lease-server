const express = require("express");
const router = express.Router();
const { createProperty, updateProperty } = require("../controllers/property");
const {
  authenticateUser,
  checkPermission, // ✅ Use checkPermission for single permission
} = require("../middlewares/auth");
const uploadS3 = require("../middlewares/uploadS3");

// ✅ Create property - Use checkPermission (not checkAnyPermission)
router.post(
  "/properties",
  authenticateUser, // 1. Authenticate user
  checkPermission("PROPERTY_CREATE"), // 2. Check single permission (pass string, not array)
  uploadS3.array("files", 10), // 3. Handle file upload
  createProperty // 4. Execute controller
);

// ✅ Update property - Use checkPermission
router.put(
  "/properties/:propertyId",
  authenticateUser, // 1. Authenticate user
  checkPermission("PROPERTY_UPDATE"), // 2. Check single permission
  uploadS3.array("files", 10), // 3. Handle file upload
  updateProperty // 4. Execute controller
);

module.exports = router;
