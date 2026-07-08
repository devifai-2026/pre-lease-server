const express = require("express");
const router = express.Router();
const {
  getCategories,
  getAllCategoriesAdmin,
  createCategory,
  updateCategory,
} = require("../controllers/category");
const {
  authenticateUser,
  checkAdminOrSuperAdmin,
} = require("../middlewares/auth");
const {
  multerUpload,
  uploadToCloudinary,
} = require("../middlewares/uploadCloudinary");

// Public read — homepage Explore-Categories cards.
router.get("/categories", getCategories);

// Admin: list all (incl. inactive), create, update. No delete by design.
// Single image only: multer caps at 1 file on the "files" field; the Cloudinary
// middleware uploads it and the controller stores its secure_url.
router.get(
  "/admin/categories",
  authenticateUser,
  checkAdminOrSuperAdmin,
  getAllCategoriesAdmin
);
router.post(
  "/admin/categories",
  authenticateUser,
  checkAdminOrSuperAdmin,
  multerUpload.array("files", 1),
  uploadToCloudinary,
  createCategory
);
router.put(
  "/admin/categories/:categoryId",
  authenticateUser,
  checkAdminOrSuperAdmin,
  multerUpload.array("files", 1),
  uploadToCloudinary,
  updateCategory
);

module.exports = router;
