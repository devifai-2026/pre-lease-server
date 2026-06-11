"use strict";

// Seeds the curated blog posts as real DB rows (previously hardcoded in the app).
const POSTS = [
  {
    slug: "future-of-commercial-real-estate-india-2026",
    title: "The Future of Commercial Real Estate in India: 2026 Outlook",
    excerpt:
      "Explore the emerging trends shaping the commercial property landscape, from sustainable workspaces to the rise of Tier-2 cities.",
    author: "Rajesh Kumar",
    category: "Market Trends",
    read_time: "5 min read",
    image_url:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2670&auto=format&fit=crop",
    is_featured: true,
    published_at: new Date("2025-10-15"),
    body:
      "India's commercial real estate market is entering a defining phase. Demand for pre-leased, income-active assets continues to rise as investors seek stable yields backed by established tenants. Sustainable, Grade-A workspaces and the rapid growth of Tier-2 cities are reshaping where and how capital is deployed. This outlook examines the structural drivers — hybrid work, GCC expansion, and infrastructure-led corridors — that will define returns through 2026.",
  },
  {
    slug: "pre-leased-properties-safe-haven-for-investors",
    title: "Pre-Leased Properties: A Safe Haven for Investors?",
    excerpt:
      "Why high-net-worth individuals are shifting their portfolios towards pre-leased assets offering steady rental yields.",
    author: "Sarah Jenkins",
    category: "Investment",
    read_time: "4 min read",
    image_url:
      "https://images.unsplash.com/photo-1460472178825-e5240623afd5?q=80&w=2669&auto=format&fit=crop",
    is_featured: false,
    published_at: new Date("2025-10-12"),
    body:
      "Pre-leased commercial properties offer a compelling proposition: a ready tenant, a signed lease, and predictable rental income from day one. For HNIs diversifying away from volatile equity, these assets behave more like fixed-income instruments with an inflation hedge built in through periodic rent escalations. This article breaks down how to evaluate the tenant covenant, lock-in, and escalation terms that determine the real safety of a pre-leased deal.",
  },
  {
    slug: "navigating-property-taxes-comprehensive-guide",
    title: "Navigating Property Taxes: A Comprehensive Guide",
    excerpt:
      "Understanding the nuances of GST, stamp duty, and registration charges when buying commercial property.",
    author: "Amit Singh",
    category: "Legal",
    read_time: "7 min read",
    image_url:
      "https://images.unsplash.com/photo-1554224155-9844c6331906?q=80&w=2672&auto=format&fit=crop",
    is_featured: false,
    published_at: new Date("2025-10-08"),
    body:
      "Taxes and statutory charges materially affect the true cost of a commercial property purchase. From GST treatment on under-construction vs. ready assets, to state-specific stamp duty and registration charges, the line items add up quickly. This guide walks through each charge, when it applies, and how to factor it into your initial-investment and ROI calculations before you commit.",
  },
  {
    slug: "co-working-spaces-the-new-norm",
    title: "Co-Working Spaces: The New Norm?",
    excerpt:
      "How the hybrid work culture is driving the demand for flexible office spaces across metro cities.",
    author: "Priya Mehta",
    category: "Commercial",
    read_time: "3 min read",
    image_url:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=2670&auto=format&fit=crop",
    is_featured: false,
    published_at: new Date("2025-10-05"),
    body:
      "Hybrid work has permanently altered office demand. Flexible and managed workspaces now anchor leasing activity in metro markets, giving landlords a tenant mix that blends enterprise stability with startup agility. We look at what this shift means for asset owners weighing conventional long leases against flexible-space operators.",
  },
  {
    slug: "residential-vs-commercial-where-to-invest",
    title: "Residential vs. Commercial: Where to Put Your Money?",
    excerpt:
      "A head-to-head on yields, liquidity, and risk between residential and commercial real estate.",
    author: "Vikram Malhotra",
    category: "Investment",
    read_time: "6 min read",
    image_url:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=2670&auto=format&fit=crop",
    is_featured: false,
    published_at: new Date("2025-09-28"),
    body:
      "Residential property is familiar and liquid; commercial property typically offers higher rental yields and longer leases. The right answer depends on your horizon, ticket size, and appetite for management overhead. This comparison lays out gross vs. net yields, vacancy risk, and exit liquidity so you can match the asset class to your goals.",
  },
  {
    slug: "sustainable-architecture-green-buildings-explained",
    title: "Sustainable Architecture: Green Buildings Explained",
    excerpt:
      "What green certifications mean for operating costs, tenant demand, and long-term asset value.",
    author: "Nisha Gupta",
    category: "Market Trends",
    read_time: "5 min read",
    image_url:
      "https://images.unsplash.com/photo-1518005020951-eccb494ad742?q=80&w=2670&auto=format&fit=crop",
    is_featured: false,
    published_at: new Date("2025-09-22"),
    body:
      "Green-certified buildings (IGBC, LEED) are no longer a premium niche — they are increasingly a baseline expectation for marquee tenants. Lower energy and water costs improve net operating income, while certification supports both occupancy and resale value. Here's what owners and investors should know about the certifications and their financial impact.",
  },
];

const { randomUUID } = require("crypto");

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = POSTS.map((p) => ({
      blog_id: randomUUID(),
      ...p,
      is_published: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert("blogs", rows, {
      // Idempotent-ish: skip if a row with the same slug already exists is handled by
      // the unique index; ignoreDuplicates avoids erroring on re-run.
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Delete ONLY the seeded posts (by slug) — never a blanket wipe.
    const slugs = POSTS.map((p) => p.slug);
    await queryInterface.bulkDelete("blogs", { slug: { [Sequelize.Op.in]: slugs } }, {});
  },
};
