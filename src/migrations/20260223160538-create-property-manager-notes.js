"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE note_status AS ENUM ('pending', 'approved');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE property_manager_notes (
        property_id        uuid NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
        sales_executive_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        notes              jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_notes_count  integer NOT NULL DEFAULT 0,
        status             note_status NOT NULL DEFAULT 'approved',
        is_active          boolean NOT NULL DEFAULT true,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        edited_by          uuid REFERENCES users(user_id) ON DELETE SET NULL,
        approved_by        uuid REFERENCES users(user_id) ON DELETE SET NULL,
        PRIMARY KEY (property_id, sales_executive_id)
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("property_manager_notes");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS note_status;`);
  },
};
