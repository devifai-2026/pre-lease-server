"use strict";

const INQUIRY_TEXTS = [
  "I am interested in this property. Can we schedule a site visit?",
  "What is the current rental yield for this property?",
  "Is the property available for immediate possession?",
  "Can you share more details about the carpet area and floor plan?",
  "What are the maintenance charges per month?",
  "Is there parking space available with this property?",
  "I would like to know more about the lease terms.",
  "Are there any pending dues or legal disputes on this property?",
  "Can the asking price be negotiated?",
  "What is the connectivity like to the nearest metro station?",
  "Is this property suitable for a tech company office setup?",
  "Can you share the RERA registration number?",
  "We are looking for a long-term lease of 5 years. Is this feasible?",
  "What amenities are included in the building?",
  "Are there other floors available in the same building?",
];

const SOURCES = ["website", "referral", "direct", "portal", "social_media"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

/**
 * Returns a random integer between min and max (inclusive).
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from an array.
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a random Date within the given month (year/month, 0-indexed month).
 * Spread across the first 28 days to avoid month-end edge cases.
 */
function randomDateInMonth(year, month) {
  const day = randomInt(1, 28);
  const hour = randomInt(8, 18);
  const minute = randomInt(0, 59);
  return new Date(year, month, day, hour, minute, 0);
}

module.exports = {
  async up(queryInterface) {
    // ── 1. Pick one random active property ──────────────────────────────────
    const [properties] = await queryInterface.sequelize.query(`
      SELECT property_id, city
      FROM properties
      WHERE is_active = true
      ORDER BY RANDOM()
      LIMIT 1;
    `);

    if (!properties || properties.length === 0) {
      console.warn("No active properties found — skipping inquiry seeder.");
      return;
    }

    const { property_id: propertyId } = properties[0];

    // ── 2. Find active users who can be inquirers (Owner=1, Investor=2, Broker=3) ──
    const [inquirers] = await queryInterface.sequelize.query(`
      SELECT DISTINCT u.user_id
      FROM users u
      JOIN user_roles ur ON u.user_id = ur.user_id
      WHERE u.is_active = true
        AND ur.role_id IN (1, 2, 3)
      LIMIT 6;
    `);

    if (!inquirers || inquirers.length === 0) {
      console.warn(
        "No active Owner/Investor/Broker users found — skipping inquiry seeder."
      );
      return;
    }

    const inquirerIds = inquirers.map((r) => r.user_id);

    // ── 3. Build 12 months of inquiry records ───────────────────────────────
    const now = new Date();
    const records = [];

    for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth(); // 0-indexed

      const entriesThisMonth = randomInt(2, 4);

      for (let i = 0; i < entriesThisMonth; i++) {
        const createdAt = randomDateInMonth(year, month);

        records.push({
          property_id: propertyId,
          inquirer_id: pick(inquirerIds),
          inquiry: pick(INQUIRY_TEXTS),
          priority: pick(PRIORITIES),
          source: pick(SOURCES),
          assigned_to: null,
          assigned_by: null,
          assigned_at: null,
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
    }

    // Sort chronologically before inserting
    records.sort((a, b) => a.created_at - b.created_at);

    await queryInterface.bulkInsert("property_inquiries", records);

    console.log(
      `Seeded ${records.length} inquiries for property ${propertyId} across 12 months.`
    );
  },

  async down(queryInterface, Sequelize) {
    // Delete ONLY rows whose inquiry text matches a seeded template (never a blanket
    // wipe — that would delete real user inquiries too).
    await queryInterface.bulkDelete(
      "property_inquiries",
      { inquiry: { [Sequelize.Op.in]: INQUIRY_TEXTS } },
      {}
    );
  },
};
