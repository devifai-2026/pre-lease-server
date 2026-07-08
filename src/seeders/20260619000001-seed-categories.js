"use strict";

// Seeds the 5 Explore-Categories cards as real DB rows (previously hardcoded in
// the app). image_url is left null: the app falls back to its bundled PNG until
// an admin uploads a hosted image via the admin panel.
const CATEGORIES = [
  { title: "Residential", value: "Residential", sort_order: 1 },
  { title: "Retail", value: "Retail", sort_order: 2 },
  { title: "Offices", value: "Offices", sort_order: 3 },
  { title: "Industrial", value: "Industrial", sort_order: 4 },
  { title: "Others", value: "Others", sort_order: 5 },
];

const { randomUUID } = require("crypto");

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = CATEGORIES.map((c) => ({
      category_id: randomUUID(),
      ...c,
      image_url: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert("categories", rows, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Delete ONLY the seeded categories (by value) — never a blanket wipe.
    const values = CATEGORIES.map((c) => c.value);
    await queryInterface.bulkDelete(
      "categories",
      { value: { [Sequelize.Op.in]: values } },
      {}
    );
  },
};
