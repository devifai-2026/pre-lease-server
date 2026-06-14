"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      "property_inquiries",
      "dealer_last_seen_at",
      {
        type: Sequelize.DATE,
        allowNull: true,
      }
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn(
      "property_inquiries",
      "dealer_last_seen_at"
    );
  },
};
