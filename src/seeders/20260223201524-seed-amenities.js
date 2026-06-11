"use strict";
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert(
      "amenities",
      [
        {
          amenity_name: "Swimming Pool",
          category: "Recreation",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Gymnasium",
          category: "Fitness",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Club House",
          category: "Community",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Children's Play Area",
          category: "Recreation",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Jogging Track",
          category: "Fitness",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Tennis Court",
          category: "Sports",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Basketball Court",
          category: "Sports",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Badminton Court",
          category: "Sports",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Indoor Games Room",
          category: "Recreation",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Party Hall",
          category: "Community",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Multipurpose Hall",
          category: "Community",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Yoga/Meditation Room",
          category: "Wellness",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Steam/Sauna Room",
          category: "Wellness",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Spa",
          category: "Wellness",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Landscaped Gardens",
          category: "Outdoor",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Amphitheater",
          category: "Community",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Library",
          category: "Education",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Business Center",
          category: "Work",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Conference Room",
          category: "Work",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Visitor Parking",
          category: "Parking",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "EV Charging Station",
          category: "Parking",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Security/CCTV",
          category: "Safety",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Fire Safety System",
          category: "Safety",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Intercom Facility",
          category: "Communication",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Wi-Fi Connectivity",
          category: "Technology",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Rainwater Harvesting",
          category: "Sustainability",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Solar Panels",
          category: "Sustainability",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Waste Management",
          category: "Sustainability",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Power Backup",
          category: "Utilities",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Water Storage",
          category: "Utilities",
          is_active: true,
          created_at: new Date(),
        },
        {
          amenity_name: "Elevator/Lift",
          category: "Infrastructure",
          is_active: true,
          created_at: new Date(),
        },
      ],
      { ignoreDuplicates: true }
    );

    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('amenities', 'amenity_id'), MAX(amenity_id)) FROM amenities;`
    );
  },
  async down(queryInterface, Sequelize) {
    // Delete only seeded amenities (by name), never a blanket wipe.
    const seededNames = [
      "Swimming Pool", "Gymnasium", "Club House", "Children's Play Area", "Jogging Track",
      "Tennis Court", "Basketball Court", "Badminton Court", "Indoor Games Room", "Party Hall",
      "Multipurpose Hall", "Yoga/Meditation Room", "Steam/Sauna Room", "Spa", "Landscaped Gardens",
      "Amphitheater", "Library", "Business Center", "Conference Room", "Visitor Parking",
      "EV Charging Station", "Security/CCTV", "Fire Safety System", "Intercom Facility",
      "Wi-Fi Connectivity", "Rainwater Harvesting", "Solar Panels", "Waste Management",
      "Power Backup", "Water Storage", "Elevator/Lift",
    ];
    await queryInterface.bulkDelete(
      "amenities",
      { amenity_name: { [Sequelize.Op.in]: seededNames } },
      {}
    );
  },
};
