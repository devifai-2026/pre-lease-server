"use strict";

// Consolidates the ad-hoc ALTER/CREATE statements that previously ran in app.js on
// every boot (DEAD-06). Idempotent — safe to run against a DB that already has them.
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    // users.deleted_at (soft delete)
    await q.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    );
    // note_status enum 'denied' value (migration originally created only pending/approved)
    await q
      .query(`ALTER TYPE note_status ADD VALUE IF NOT EXISTS 'denied'`)
      .catch((e) => {
        // ADD VALUE cannot run inside a txn on older PG / may already exist — tolerate.
        if (!/already exists/i.test(e.message)) {
          // eslint-disable-next-line no-console
          console.warn("note_status 'denied' add:", e.message);
        }
      });
    // broker_profiles table + profile_photo column
    await q.query(`
      CREATE TABLE IF NOT EXISTS broker_profiles (
        profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
        company_name VARCHAR(255),
        locality VARCHAR(255),
        specializations TEXT,
        deals_closed INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q.query(
      `ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS profile_photo TEXT`
    );
  },

  async down() {
    // No-op: these are additive schema guarantees other migrations/data depend on.
    // We don't drop deleted_at / broker_profiles here to avoid data loss.
  },
};
