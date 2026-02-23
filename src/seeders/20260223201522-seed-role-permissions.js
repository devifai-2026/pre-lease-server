"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "role_permissions",
      [
        {
          role_id: 1,
          permission_id: 1,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 1,
          permission_id: 3,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 1,
          permission_id: 4,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 3,
          permission_id: 1,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 3,
          permission_id: 2,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 3,
          permission_id: 3,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 4,
          permission_id: 15,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 5,
          permission_id: 5,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 5,
          permission_id: 6,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 5,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 6,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 7,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 8,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 9,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 10,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 13,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 6,
          permission_id: 14,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 5,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 6,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 7,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 8,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 9,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 10,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 13,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 7,
          permission_id: 14,
          granted_at: new Date(),
          granted_by: null,
        },
        {
          role_id: 8,
          permission_id: 16,
          granted_at: new Date(),
          granted_by: null,
        },
      ],
      { ignoreDuplicates: true }
    );
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("role_permissions", null, {});
  },
};
