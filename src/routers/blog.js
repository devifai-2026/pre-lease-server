const express = require("express");
const router = express.Router();
const {
  getBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
} = require("../controllers/blog");
const { authenticateUser, checkAdminOrSuperAdmin } = require("../middlewares/auth");

// Public read
router.get("/blogs", getBlogs);
router.get("/blogs/:slug", getBlogBySlug);

// Admin CRUD
router.post("/admin/blogs", authenticateUser, checkAdminOrSuperAdmin, createBlog);
router.put("/admin/blogs/:blogId", authenticateUser, checkAdminOrSuperAdmin, updateBlog);
router.delete("/admin/blogs/:blogId", authenticateUser, checkAdminOrSuperAdmin, deleteBlog);

module.exports = router;
