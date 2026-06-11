const { Op } = require("sequelize");
const { Blog } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const createAppError = require("../utils/appError");
const { sendEncodedResponse } = require("../utils/responseEncoder");
const { getPagination } = require("../utils/validators");

const slugify = (title) =>
  String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

// GET /api/v1/blogs  (public) — list published posts
const getBlogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, category } = req.query;
  const { pageNumber, pageSize, offset } = getPagination(page, limit, 20);

  const where = { isPublished: true };
  if (category) where.category = category;

  const { count, rows } = await Blog.findAndCountAll({
    where,
    order: [
      ["isFeatured", "DESC"],
      ["publishedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
    limit: pageSize,
    offset,
  });

  return sendEncodedResponse(
    res,
    200,
    true,
    "Blogs fetched successfully",
    rows,
    {
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalItems: count,
        totalPages: Math.ceil(count / pageSize),
      },
    }
  );
});

// GET /api/v1/blogs/:slug  (public) — single published post by slug OR uuid
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  // Only compare against the UUID column when the param is actually a UUID,
  // otherwise Postgres throws "invalid input syntax for type uuid".
  const or = [{ slug }];
  if (UUID_RE.test(slug)) or.push({ blogId: slug });
  const blog = await Blog.findOne({
    where: { isPublished: true, [Op.or]: or },
  });
  if (!blog) throw createAppError("Blog post not found", 404);
  return sendEncodedResponse(res, 200, true, "Blog fetched successfully", blog);
});

// POST /api/v1/admin/blogs  (Admin/Super Admin) — create
const createBlog = asyncHandler(async (req, res) => {
  const { title, excerpt, body, author, category, imageUrl, readTime, isFeatured, isPublished } = req.body;
  if (!title || !String(title).trim()) {
    throw createAppError("title is required", 400);
  }
  let slug = slugify(title);
  // ensure unique slug
  const existing = await Blog.findOne({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const blog = await Blog.create({
    slug,
    title,
    excerpt: excerpt || null,
    body: body || null,
    author: author || null,
    category: category || null,
    imageUrl: imageUrl || null,
    readTime: readTime || null,
    isFeatured: !!isFeatured,
    isPublished: isPublished !== undefined ? !!isPublished : true,
    publishedAt: new Date(),
  });
  return sendEncodedResponse(res, 201, true, "Blog created successfully", blog);
});

// PUT /api/v1/admin/blogs/:blogId  (Admin/Super Admin) — update
const updateBlog = asyncHandler(async (req, res) => {
  const { blogId } = req.params;
  const blog = await Blog.findByPk(blogId);
  if (!blog) throw createAppError("Blog post not found", 404);

  const fields = ["title", "excerpt", "body", "author", "category", "imageUrl", "readTime", "isFeatured", "isPublished"];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  await blog.update(updates);
  return sendEncodedResponse(res, 200, true, "Blog updated successfully", blog);
});

// DELETE /api/v1/admin/blogs/:blogId  (Admin/Super Admin)
const deleteBlog = asyncHandler(async (req, res) => {
  const { blogId } = req.params;
  const blog = await Blog.findByPk(blogId);
  if (!blog) throw createAppError("Blog post not found", 404);
  await blog.destroy();
  return sendEncodedResponse(res, 200, true, "Blog deleted successfully", { blogId });
});

module.exports = { getBlogs, getBlogBySlug, createBlog, updateBlog, deleteBlog };
