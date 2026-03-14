"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("property_notification_event", "title", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("property_notification_event", "title");
  },
};
