"use strict";

// Score per pipeline stage. Required going forward; admins set it when creating
// a stage. Existing seeded stages get sensible defaults here.
const DEFAULT_SCORES = {
  New: 2,
  Contacted: 5,
  Negotiating: 10,
  Closed: 15,
  Converted: 25,
  Lost: 0,
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add nullable first so existing rows don't violate NOT NULL, backfill,
    // then enforce NOT NULL with a default.
    await queryInterface.addColumn("inquiry_stages", "score", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    for (const [name, score] of Object.entries(DEFAULT_SCORES)) {
      await queryInterface.sequelize.query(
        "UPDATE inquiry_stages SET score = :score WHERE name = :name AND score IS NULL",
        { replacements: { score, name } }
      );
    }
    // Any other existing stages → 0
    await queryInterface.sequelize.query(
      "UPDATE inquiry_stages SET score = 0 WHERE score IS NULL"
    );

    await queryInterface.changeColumn("inquiry_stages", "score", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("inquiry_stages", "score");
  },
};
