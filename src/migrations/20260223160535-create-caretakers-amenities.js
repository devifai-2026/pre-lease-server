"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS property_verification_logs (
        id          UUID NOT NULL DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE ON UPDATE CASCADE,
        user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
        status      VARCHAR(20) NOT NULL DEFAULT 'pending',
        role_at_verification character varying(100) NOT NULL DEFAULT 'Admin',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_property_verification_logs PRIMARY KEY (id),
        CONSTRAINT chk_pvl_status CHECK (status IN ('pending','verified'))
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("property_verification_logs");
  },
};
