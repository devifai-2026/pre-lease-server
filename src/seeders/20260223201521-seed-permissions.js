"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "permissions",
      [
        {
          permission_id: 1,
          code: "PROPERTY_CREATE",
          description: "Create new property",
          category: "property",
          created_at: new Date(),
        },
        {
          permission_id: 2,
          code: "PROPERTY_VIEW",
          description: "View properties",
          category: "property",
          created_at: new Date(),
        },
        {
          permission_id: 3,
          code: "PROPERTY_UPDATE",
          description: "Update property details",
          category: "property",
          created_at: new Date(),
        },
        {
          permission_id: 4,
          code: "PROPERTY_DELETE",
          description: "Delete property",
          category: "property",
          created_at: new Date(),
        },
        {
          permission_id: 5,
          code: "USER_CREATE",
          description: "Create new user",
          category: "user_management",
          created_at: new Date(),
        },
        {
          permission_id: 6,
          code: "USER_VIEW",
          description: "View user details",
          category: "user_management",
          created_at: new Date(),
        },
        {
          permission_id: 7,
          code: "USER_UPDATE",
          description: "Update user details",
          category: "user_management",
          created_at: new Date(),
        },
        {
          permission_id: 8,
          code: "USER_DELETE",
          description: "Delete user",
          category: "user_management",
          created_at: new Date(),
        },
        {
          permission_id: 9,
          code: "ROLE_ASSIGN",
          description: "Assign roles to users",
          category: "role_management",
          created_at: new Date(),
        },
        {
          permission_id: 10,
          code: "ROLE_REVOKE",
          description: "Revoke roles from users",
          category: "role_management",
          created_at: new Date(),
        },
        {
          permission_id: 11,
          code: "REPORT_SALES",
          description: "View sales reports",
          category: "reports",
          created_at: new Date(),
        },
        {
          permission_id: 12,
          code: "REPORT_ANALYTICS",
          description: "View analytics dashboard",
          category: "reports",
          created_at: new Date(),
        },
        {
          permission_id: 13,
          code: "SYSTEM_CONFIG",
          description: "Configure system settings",
          category: "system",
          created_at: new Date(),
        },
        {
          permission_id: 14,
          code: "AUDIT_LOG_VIEW",
          description: "View audit logs",
          category: "system",
          created_at: new Date(),
        },
        {
          permission_id: 15,
          code: "PROPERTY_NOTES",
          description: "Create properties notes",
          category: "property",
          created_at: new Date(),
        },
        {
          permission_id: 16,
          code: "PROPERTY_INQUIRY_VIEW",
          description: "View properties inquiry",
          category: "property",
          created_at: new Date(),
        },
      ],
      { ignoreDuplicates: true }
    );

    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('permissions', 'permission_id'), MAX(permission_id)) FROM permissions;`
    );
  },
  async down(queryInterface, Sequelize) {
    // Delete only the seeded permission codes, not any later-added ones.
    const seededCodes = [
      "PROPERTY_CREATE", "PROPERTY_VIEW", "PROPERTY_UPDATE", "PROPERTY_DELETE",
      "USER_CREATE", "USER_VIEW", "USER_UPDATE", "USER_DELETE",
      "ROLE_ASSIGN", "ROLE_REVOKE", "REPORT_SALES", "REPORT_ANALYTICS",
      "SYSTEM_CONFIG", "AUDIT_LOG_VIEW", "PROPERTY_NOTES", "PROPERTY_INQUIRY_VIEW",
    ];
    await queryInterface.bulkDelete(
      "permissions",
      { code: { [Sequelize.Op.in]: seededCodes } },
      {}
    );
  },
};
