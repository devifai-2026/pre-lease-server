"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS property_verification_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        property_id UUID NOT NULL,
        user_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        role_at_verification VARCHAR(100) NOT NULL DEFAULT 'Admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_property_verification_logs PRIMARY KEY (id),
        CONSTRAINT fk_pvl_property FOREIGN KEY (property_id)
          REFERENCES properties(property_id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_pvl_user FOREIGN KEY (user_id)
          REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT chk_pvl_status CHECK (status IN ('pending','verified'))
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("property_verification_logs");
  },
};
