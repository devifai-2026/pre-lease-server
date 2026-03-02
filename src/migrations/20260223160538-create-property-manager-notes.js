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
      CREATE TABLE IF NOT EXISTS property_manager_notes (
        note_id UUID NOT NULL DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL,
        sales_executive_id UUID NOT NULL,
        notes TEXT NOT NULL DEFAULT '[]',
        status note_status NOT NULL DEFAULT 'approved',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        edited_by UUID NULL,
        approved_by UUID NULL,
        created_by UUID NULL,
        updated_by UUID NULL,
        is_edited BOOLEAN NOT NULL DEFAULT false,
        edited_note TEXT NULL,
        CONSTRAINT property_manager_notes_pkey PRIMARY KEY (note_id),
        CONSTRAINT fk_property_manager_property FOREIGN KEY (property_id)
          REFERENCES properties(property_id) ON DELETE CASCADE,
        CONSTRAINT fk_property_manager_sales_executive FOREIGN KEY (sales_executive_id)
          REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_property_manager_notes_edited_by FOREIGN KEY (edited_by)
          REFERENCES users(user_id) ON DELETE SET NULL,
        CONSTRAINT fk_property_manager_notes_approved_by FOREIGN KEY (approved_by)
          REFERENCES users(user_id) ON DELETE SET NULL,
        CONSTRAINT property_manager_notes_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES users(user_id) ON DELETE SET NULL,
        CONSTRAINT property_manager_notes_updated_by_fkey FOREIGN KEY (updated_by)
          REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("property_manager_notes");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS note_status;`);
  },
};
