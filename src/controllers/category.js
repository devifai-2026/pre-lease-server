const { Category } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const createAppError = require("../utils/appError");
const { sendEncodedResponse } = require("../utils/responseEncoder");

// The Cloudinary middleware (uploadCloudinary) buffers each uploaded file and
// sets file.gcsPath = result.secure_url. Categories allow a single image only,
// so we read the first uploaded file when present.
const uploadedImageUrl = (req) =>
  req.files && req.files.length > 0 ? req.files[0].gcsPath : undefined;

// GET /api/v1/categories  (public) — active cards for the homepage, ordered.
const getCategories = asyncHandler(async (req, res) => {
  const rows = await Category.findAll({
    where: { isActive: true },
    order: [
      ["sortOrder", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
  return sendEncodedResponse(
    res,
    200,
    true,
    "Categories fetched successfully",
    rows
  );
});

// GET /api/v1/admin/categories  (Admin/Super Admin) — all rows incl. inactive.
const getAllCategoriesAdmin = asyncHandler(async (req, res) => {
  const rows = await Category.findAll({
    order: [
      ["sortOrder", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
  return sendEncodedResponse(
    res,
    200,
    true,
    "Categories fetched successfully",
    rows
  );
});

// POST /api/v1/admin/categories  (Admin/Super Admin) — create a card.
// Accepts multipart/form-data with an optional single image field named "image"
// (or "files"), plus title / value / sortOrder / isActive fields.
const createCategory = asyncHandler(async (req, res) => {
  const { title, value, sortOrder, isActive } = req.body;
  if (!title || !String(title).trim()) {
    throw createAppError("title is required", 400);
  }

  const imageUrl = uploadedImageUrl(req);

  const category = await Category.create({
    title: String(title).trim(),
    // Default the filter value to the title when not explicitly provided.
    value: value && String(value).trim() ? String(value).trim() : String(title).trim(),
    imageUrl: imageUrl || null,
    sortOrder: sortOrder !== undefined ? parseInt(sortOrder, 10) || 0 : 0,
    isActive: isActive !== undefined ? isActive === true || isActive === "true" : true,
  });

  return sendEncodedResponse(
    res,
    201,
    true,
    "Category created successfully",
    category
  );
});

// PUT /api/v1/admin/categories/:categoryId  (Admin/Super Admin) — edit a card.
// A newly uploaded image replaces the existing one (max 1 image, replace-only).
const updateCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const category = await Category.findByPk(categoryId);
  if (!category) throw createAppError("Category not found", 404);

  const updates = {};
  if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
  if (req.body.value !== undefined) updates.value = String(req.body.value).trim();
  if (req.body.sortOrder !== undefined) {
    updates.sortOrder = parseInt(req.body.sortOrder, 10) || 0;
  }
  if (req.body.isActive !== undefined) {
    updates.isActive =
      req.body.isActive === true || req.body.isActive === "true";
  }

  const imageUrl = uploadedImageUrl(req);
  if (imageUrl) updates.imageUrl = imageUrl; // replace only when a new file arrives

  await category.update(updates);

  return sendEncodedResponse(
    res,
    200,
    true,
    "Category updated successfully",
    category
  );
});

module.exports = {
  getCategories,
  getAllCategoriesAdmin,
  createCategory,
  updateCategory,
};
