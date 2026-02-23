"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE sales_relationship (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_executive_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        sales_manager_id   uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        assigned_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        assigned_by        uuid REFERENCES users(user_id) ON DELETE SET NULL,
        unassigned_at      TIMESTAMP,
        unassigned_by      uuid REFERENCES users(user_id) ON DELETE SET NULL,
        is_active          BOOLEAN NOT NULL DEFAULT true,
        remarks            TEXT,
        created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_different_users CHECK (sales_executive_id != sales_manager_id)
      );
    `);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("sales_relationship");
  },
};
