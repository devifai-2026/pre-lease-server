// models/index.js
const { sequelize } = require("../config/dbConnection");

// ============================================
// IMPORT ALL MODELS
// ============================================
const User = require("./user");
const Role = require("./role");
const Permission = require("./permission");
const UserRole = require("./userRole");
const RolePermission = require("./rolePermission");
const Token = require("./token");
const Caretaker = require("./caretaker");
const Amenity = require("./amenity");
const Property = require("./properties");
const PropertyAmenity = require("./propertyAmenity");
const PropertyCertification = require("./propertyCertification");
const PropertyConnectivity = require("./propertyConnectivity");
const PropertyMedia = require("./propertyMedia");
const AuditLog = require("./auditLog");
const ApiLog = require("./apiLog");

// ============================================
// DEFINE MODEL ASSOCIATIONS
// ============================================

// ============================================
// USER ↔ ROLE (Many-to-Many)
// A user can have multiple roles (Owner + Broker)
// A role can be assigned to multiple users
// ============================================
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: "userId",
  otherKey: "roleId",
  as: "roles",
});

Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: "roleId",
  otherKey: "userId",
  as: "users",
});

// ============================================
// USER_ROLE DIRECT ASSOCIATIONS
// For tracking who assigned the role
// ============================================
UserRole.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

UserRole.belongsTo(Role, {
  foreignKey: "roleId",
  as: "role",
});

UserRole.belongsTo(User, {
  foreignKey: "assignedBy",
  as: "assignedByUser",
});

// ============================================
// ROLE ↔ PERMISSION (Many-to-Many)
// A role has multiple permissions (CRUD operations)
// A permission can belong to multiple roles
// ============================================
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: "roleId",
  otherKey: "permissionId",
  as: "permissions",
});

Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: "permissionId",
  otherKey: "roleId",
  as: "roles",
});

// ============================================
// ROLE_PERMISSION DIRECT ASSOCIATIONS
// For tracking who granted the permission
// ============================================
RolePermission.belongsTo(Role, {
  foreignKey: "roleId",
  as: "role",
});

RolePermission.belongsTo(Permission, {
  foreignKey: "permissionId",
  as: "permission",
});

RolePermission.belongsTo(User, {
  foreignKey: "grantedBy",
  as: "grantedByUser",
});

// ============================================
// USER ↔ TOKEN (One-to-Many)
// A user can have multiple active tokens (access + refresh)
// ============================================
User.hasMany(Token, {
  foreignKey: "userId",
  as: "tokens",
});

Token.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// ============================================
// USER ↔ PROPERTY - OWNER (One-to-Many)
// A user (Owner) can own multiple properties
// ============================================
User.hasMany(Property, {
  foreignKey: "ownerId",
  as: "ownedProperties",
});

Property.belongsTo(User, {
  foreignKey: "ownerId",
  as: "owner",
});

// ============================================
// USER ↔ PROPERTY - BROKER (One-to-Many)
// A user (Broker) can list multiple properties
// ============================================
User.hasMany(Property, {
  foreignKey: "brokerId",
  as: "listedProperties",
});

Property.belongsTo(User, {
  foreignKey: "brokerId",
  as: "broker",
});

// ============================================
// CARETAKER ↔ PROPERTY (One-to-Many)
// A caretaker can maintain multiple properties
// ============================================
Caretaker.hasMany(Property, {
  foreignKey: "maintainedById",
  as: "properties",
});

Property.belongsTo(Caretaker, {
  foreignKey: "maintainedById",
  as: "caretaker",
});

// ============================================
// PROPERTY ↔ AMENITY (Many-to-Many)
// A property can have multiple amenities (gym, pool, etc.)
// An amenity can be in multiple properties
// ============================================
Property.belongsToMany(Amenity, {
  through: PropertyAmenity,
  foreignKey: "propertyId",
  otherKey: "amenityId",
  as: "amenities",
});

Amenity.belongsToMany(Property, {
  through: PropertyAmenity,
  foreignKey: "amenityId",
  otherKey: "propertyId",
  as: "properties",
});

// ============================================
// PROPERTY_AMENITY DIRECT ASSOCIATIONS
// For querying junction table directly
// ============================================
PropertyAmenity.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

PropertyAmenity.belongsTo(Amenity, {
  foreignKey: "amenityId",
  as: "amenity",
});

// ============================================
// PROPERTY ↔ PROPERTY_CERTIFICATION (One-to-Many)
// A property can have multiple certifications (LEED, IGBC, etc.)
// ============================================
Property.hasMany(PropertyCertification, {
  foreignKey: "propertyId",
  as: "certifications",
});

PropertyCertification.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// ============================================
// PROPERTY ↔ PROPERTY_CONNECTIVITY (One-to-Many)
// A property can have multiple connectivity options (metro, airport, etc.)
// ============================================
Property.hasMany(PropertyConnectivity, {
  foreignKey: "propertyId",
  as: "connectivity",
});

PropertyConnectivity.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// ============================================
// PROPERTY ↔ PROPERTY_MEDIA (One-to-Many)
// A property can have multiple media files (photos, videos)
// ============================================
Property.hasMany(PropertyMedia, {
  foreignKey: "propertyId",
  as: "media",
});

PropertyMedia.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// ============================================
// USER ↔ AUDIT_LOG (One-to-Many)
// A user can perform multiple audited actions
// Tracks who made the change
// ============================================
User.hasMany(AuditLog, {
  foreignKey: "userId", // ✅ Fixed: was "updatedBy"
  as: "auditLogs",
});

AuditLog.belongsTo(User, {
  foreignKey: "userId",
  as: "user", // ✅ Fixed: was "updatedByUser"
});

// ============================================
// PROPERTY ↔ AUDIT_LOG (One-to-Many)
// A property can have multiple audit log entries
// Tracks changes to specific property
// ============================================
Property.hasMany(AuditLog, {
  foreignKey: "recordId",
  as: "auditLogs", // ✅ Fixed: was "record"
  constraints: false, // ✅ Added: Since recordId can reference multiple tables
  scope: {
    entityType: "Property", // ✅ Added: Filter by entity type
  },
});

AuditLog.belongsTo(Property, {
  foreignKey: "recordId",
  as: "property", // ✅ Fixed: proper alias
  constraints: false, // ✅ Added: Polymorphic relationship
});

// ============================================
// USER ↔ API_LOG (One-to-Many)
// A user can make multiple API requests
// Tracks API usage per user
// ============================================
User.hasMany(ApiLog, {
  foreignKey: "userId",
  as: "apiLogs",
});

ApiLog.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// ============================================
// EXPORT ALL MODELS
// ============================================
module.exports = {
  sequelize,
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  Token,
  Caretaker,
  Amenity,
  Property,
  PropertyAmenity,
  PropertyCertification,
  PropertyConnectivity,
  PropertyMedia,
  AuditLog,
  ApiLog,
};
