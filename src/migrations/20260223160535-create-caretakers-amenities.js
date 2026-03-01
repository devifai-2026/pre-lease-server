"use strict";
module.exports = {
  async up(queryInterface) {
    // Create caretakers table
    await queryInterface.sequelize.query(`
      CREATE TABLE caretakers (
        caretaker_id SERIAL PRIMARY KEY,
        caretaker_name varchar(200) NOT NULL UNIQUE,
        caretaker_type varchar(50) CHECK (caretaker_type IN ('Developer','Third-party','RWA','Self-managed')),
        contact_info varchar(100),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Create amenities table
    await queryInterface.sequelize.query(`
      CREATE TABLE amenities (
        amenity_id SERIAL PRIMARY KEY,
        amenity_name varchar(100) NOT NULL UNIQUE,
        category varchar(100),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("amenities");
    await queryInterface.dropTable("caretakers");
  },
};
