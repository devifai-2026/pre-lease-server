"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE property_inquiries (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        property_id uuid NOT NULL REFERENCES properties(property_id) ON DELETE RESTRICT,
        inquirer_id uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
        inquiry TEXT NOT NULL,
        priority varchar(20) DEFAULT 'medium',
        assigned_to uuid REFERENCES users(user_id) ON DELETE SET NULL,
        assigned_by uuid REFERENCES users(user_id) ON DELETE SET NULL,
        assigned_at timestamptz,
        source varchar(50),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT property_inquiries_pkey PRIMARY KEY (id),
        CONSTRAINT property_inquiries_priority_check CHECK (priority IN ('low','medium','high','urgent'))
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE TRIGGER update_property_inquiries_updated_at
      BEFORE UPDATE ON property_inquiries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS update_property_inquiries_updated_at ON property_inquiries;
    `);
    await queryInterface.dropTable("property_inquiries");
  },
};
