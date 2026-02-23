"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE property_inquiries (
        id           uuid NOT NULL DEFAULT gen_random_uuid(),
        property_id  uuid NOT NULL REFERENCES properties(property_id) ON DELETE RESTRICT,
        inquirer_id  uuid NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
        inquiries    jsonb NOT NULL DEFAULT '[]'::jsonb,
        status       varchar(30) NOT NULL DEFAULT 'pending',
        priority     varchar(20) DEFAULT 'medium',
        assigned_to  uuid REFERENCES users(user_id) ON DELETE SET NULL,
        assigned_by  uuid REFERENCES users(user_id) ON DELETE SET NULL,
        assigned_at  timestamptz,
        source       varchar(50),
        created_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT property_inquiries_pkey PRIMARY KEY (id),
        CONSTRAINT property_inquiries_property_id_inquirer_id_key UNIQUE (property_id, inquirer_id),
        CONSTRAINT property_inquiries_status_check CHECK (status IN (
          'pending','assigned','in_progress','contacted',
          'follow_up_scheduled','converted','closed'
        )),
        CONSTRAINT property_inquiries_priority_check CHECK (priority IN ('low','medium','high','urgent')),
        CONSTRAINT inquiries_not_empty CHECK (jsonb_array_length(inquiries) > 0),
        CONSTRAINT valid_assignment CHECK (
          (status IN ('assigned','in_progress','contacted','follow_up_scheduled')
            AND assigned_to IS NOT NULL AND assigned_by IS NOT NULL AND assigned_at IS NOT NULL)
          OR status NOT IN ('assigned','in_progress','contacted','follow_up_scheduled')
        )
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
