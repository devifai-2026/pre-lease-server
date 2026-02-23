"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "caretakers",
      [
        {
          caretaker_name: "Knight Frank",
          caretaker_type: "Third-party",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Savills",
          caretaker_type: "Third-party",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Godrej Properties",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Prestige Group",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "DLF Limited",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Sobha Limited",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Brigade Group",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Puravankara Limited",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Mahindra Lifespace",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Tata Housing",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Lodha Group",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Runwal Group",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Hiranandani Group",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Shapoorji Pallonji",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Oberoi Realty",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Sunteck Realty",
          caretaker_type: "Developer",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "In-house Maintenance Team",
          caretaker_type: "Self-managed",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Resident Welfare Association",
          caretaker_type: "RWA",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Third-party Facility Management",
          caretaker_type: "Third-party",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
        {
          caretaker_name: "Self-maintained by Owner",
          caretaker_type: "Self-managed",
          contact_info: null,
          is_active: true,
          created_at: new Date(),
        },
      ],
      { ignoreDuplicates: true }
    );

    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('caretakers', 'caretaker_id'), MAX(caretaker_id)) FROM caretakers;`
    );
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("caretakers", null, {});
  },
};
