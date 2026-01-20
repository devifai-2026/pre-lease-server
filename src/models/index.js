const { sequelize } = require("../config/dbConnection");
const User = require("./user");
const Permission = require("./permission");
const UserRole = require("./userRole");
const Token = require("./token");
const Property = require("./properties");
const PropertyMedia = require("./propertyMedia");

// ============================================
// Define Model Associations
// ============================================

// User ↔ UserRole (One-to-Many)
// One user can have multiple roles
User.hasMany(UserRole, {
  foreignKey: "user_id",
  as: "roles",
});

// Each role belongs to one user
UserRole.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// User ↔ Token (One-to-Many)
// One user can have multiple active tokens (multiple devices/sessions)
User.hasMany(Token, {
  foreignKey: "userId",
  as: "tokens",
});

// Each token belongs to one user
Token.belongsTo(User, {
  foreignKey: "userId",
  targetKey: "userId",
  as: "user",
});

// User ↔ Property (One-to-Many)
// One user (owner) can have multiple properties
User.hasMany(Property, {
  foreignKey: "ownerId",
  as: "properties",
});

// Each property belongs to one owner (user)
Property.belongsTo(User, {
  foreignKey: "ownerId",
  as: "owner",
});

// Property ↔ PropertyMedia (One-to-Many)
// One property can have multiple media files (photos/videos)
Property.hasMany(PropertyMedia, {
  foreignKey: "propertyId",
  as: "media",
});

// Each media file belongs to one property
PropertyMedia.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// ============================================
// Export All Models
// ============================================
module.exports = {
  sequelize, // Database connection instance
  User, // User model
  Permission, // Permission model (RBAC)
  UserRole, // User roles mapping
  Token, // Refresh tokens for authentication
  Property, // Property listings
  PropertyMedia, // Property photos and videos
};
