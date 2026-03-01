"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column;
    `);
  },
};
