"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "roles",
      [
        {
          role_id: 1,
          role_name: "Owner",
          role_type: "client",
          description: "Property owner",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 2,
          role_name: "Investor",
          role_type: "client",
          description: "Property investor",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 3,
          role_name: "Broker",
          role_type: "client",
          description: "Property broker",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 4,
          role_name: "Sales Executive - Property Manager",
          role_type: "admin",
          description: "Sales executive role",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 5,
          role_name: "Sales Manager",
          role_type: "admin",
          description: "Sales manager role",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 6,
          role_name: "Admin",
          role_type: "admin",
          description: "General admin role",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 7,
          role_name: "Super Admin",
          role_type: "admin",
          description: "Super admin with full access",
          is_active: true,
          created_at: new Date(),
        },
        {
          role_id: 8,
          role_name: "Sales Executive - Client Dealer",
          role_type: "admin",
          description:
            "Sales executive specializing in client relationships, negotiations, and deal closures",
          is_active: true,
          created_at: new Date(),
        },
      ],
      { ignoreDuplicates: true }
    );

    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('roles', 'role_id'), MAX(role_id)) FROM roles;`
    );
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("roles", null, {});
  },
};
