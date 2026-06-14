"use strict";
const { v4: uuidv4 } = require("uuid");

// Default enquiry pipeline. Marked is_system so they can be deactivated/renamed
// but not deleted. Admins can add more stages from Advanced Settings.
const DEFAULT_STAGES = [
  { name: "New", sortOrder: 1, isTerminal: false, color: "#64748B" },
  { name: "Contacted", sortOrder: 2, isTerminal: false, color: "#2563EB" },
  { name: "Negotiating", sortOrder: 3, isTerminal: false, color: "#EA580C" },
  { name: "Closed", sortOrder: 4, isTerminal: false, color: "#7C3AED" },
  { name: "Converted", sortOrder: 5, isTerminal: true, color: "#16A34A" },
  { name: "Lost", sortOrder: 6, isTerminal: true, color: "#DC2626" },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      "inquiry_stages",
      DEFAULT_STAGES.map((s) => ({
        id: uuidv4(),
        name: s.name,
        sort_order: s.sortOrder,
        is_terminal: s.isTerminal,
        color: s.color,
        is_active: true,
        is_system: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      "inquiry_stages",
      { is_system: true },
      {}
    );
  },
};
