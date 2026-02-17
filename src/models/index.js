const { sequelize } = require("../config/dbConnection");

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
const SalesRelationship = require("./salesRelationship");
const PropertyManagerNotes = require("./propertyManagerNotes");
const PropertyInquiry = require("./propertyInquiries");

// ============================================
// USER & ROLE ASSOCIATIONS
// ============================================

// User <-> Role (Many-to-Many)
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

UserRole.belongsTo(User, { foreignKey: "userId", as: "user" });
UserRole.belongsTo(Role, { foreignKey: "roleId", as: "role" });
UserRole.belongsTo(User, { foreignKey: "assignedBy", as: "assignedByUser" });

// Role <-> Permission (Many-to-Many)
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

RolePermission.belongsTo(Role, { foreignKey: "roleId", as: "role" });
RolePermission.belongsTo(Permission, {
  foreignKey: "permissionId",
  as: "permission",
});
RolePermission.belongsTo(User, {
  foreignKey: "grantedBy",
  as: "grantedByUser",
});

// User <-> Token (One-to-Many)
User.hasMany(Token, { foreignKey: "userId", as: "tokens" });
Token.belongsTo(User, { foreignKey: "userId", as: "user" });

// ============================================
// PROPERTY ASSOCIATIONS
// ============================================

// User <-> Property - Owner (One-to-Many)
User.hasMany(Property, { foreignKey: "ownerId", as: "ownedProperties" });
Property.belongsTo(User, { foreignKey: "ownerId", as: "owner" });

// User <-> Property - Broker (One-to-Many)
User.hasMany(Property, { foreignKey: "brokerId", as: "listedProperties" });
Property.belongsTo(User, { foreignKey: "brokerId", as: "broker" });

// User <-> Property - Sales Agent (One-to-Many)
User.hasMany(Property, { foreignKey: "salesId", as: "salesProperties" });
Property.belongsTo(User, { foreignKey: "salesId", as: "salesAgent" });

// Caretaker <-> Property (One-to-Many)
Caretaker.hasMany(Property, { foreignKey: "maintainedById", as: "properties" });
Property.belongsTo(Caretaker, {
  foreignKey: "maintainedById",
  as: "caretaker",
});

// Property <-> Amenity (Many-to-Many)
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

PropertyAmenity.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});
PropertyAmenity.belongsTo(Amenity, { foreignKey: "amenityId", as: "amenity" });

// Property <-> PropertyCertification (One-to-Many)
Property.hasMany(PropertyCertification, {
  foreignKey: "propertyId",
  as: "certifications",
});
PropertyCertification.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// Property <-> PropertyConnectivity (One-to-Many)
Property.hasMany(PropertyConnectivity, {
  foreignKey: "propertyId",
  as: "connectivity",
});
PropertyConnectivity.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// Property <-> PropertyMedia (One-to-Many)
Property.hasMany(PropertyMedia, { foreignKey: "propertyId", as: "media" });
PropertyMedia.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

// ============================================
// SALES RELATIONSHIP ASSOCIATIONS
// ============================================

// SalesRelationship -> User (Sales Executive)
SalesRelationship.belongsTo(User, {
  foreignKey: "salesExecutiveId",
  as: "salesExecutive",
  onDelete: "CASCADE",
});

// SalesRelationship -> User (Sales Manager)
SalesRelationship.belongsTo(User, {
  foreignKey: "salesManagerId",
  as: "salesManager",
  onDelete: "CASCADE",
});

// SalesRelationship -> User (Assigned By)
SalesRelationship.belongsTo(User, {
  foreignKey: "assignedBy",
  as: "assignedByUser",
  onDelete: "SET NULL",
});

// SalesRelationship -> User (Unassigned By)
SalesRelationship.belongsTo(User, {
  foreignKey: "unassignedBy",
  as: "unassignedByUser",
  onDelete: "SET NULL",
});

// User -> SalesRelationship (As Executive)
User.hasMany(SalesRelationship, {
  foreignKey: "salesExecutiveId",
  as: "executiveRelationships",
});

// User -> SalesRelationship (As Manager)
User.hasMany(SalesRelationship, {
  foreignKey: "salesManagerId",
  as: "managerRelationships",
});

// ============================================
// PROPERTY INVESTOR NOTES ASSOCIATIONS
// ============================================

// Property <-> PropertyManagerNotes (One-to-Many)
Property.hasMany(PropertyManagerNotes, {
  foreignKey: "propertyId",
  as: "managerNotes", // ✅ Changed from "investorNotes"
});

PropertyManagerNotes.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// User (Sales Executive) <-> PropertyManagerNotes (One-to-Many)
User.hasMany(PropertyManagerNotes, {
  foreignKey: "salesExecutiveId",
  as: "propertyNotes",
});

PropertyManagerNotes.belongsTo(User, {
  foreignKey: "salesExecutiveId",
  as: "salesExecutive",
});

// ============================================
// AUDIT LOG ASSOCIATIONS
// ============================================

// User <-> AuditLog (One-to-Many)
User.hasMany(AuditLog, { foreignKey: "userId", as: "auditLogs" });
AuditLog.belongsTo(User, { foreignKey: "userId", as: "user" });

// Property <-> AuditLog (One-to-Many, polymorphic)
Property.hasMany(AuditLog, {
  foreignKey: "recordId",
  as: "auditLogs",
  constraints: false,
  scope: { entityType: "Property" },
});

AuditLog.belongsTo(Property, {
  foreignKey: "recordId",
  as: "property",
  constraints: false,
});

// ============================================
// PROPERTY INQUIRIES ASSOCIATIONS (SIMPLE & WORKING)
// ============================================

// Property -> PropertyInquiry (1:M)
Property.hasMany(PropertyInquiry, {
  foreignKey: "propertyId",
  as: "inquiries",
});

PropertyInquiry.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// User (Inquirer) -> PropertyInquiry (1:M)
User.hasMany(PropertyInquiry, {
  foreignKey: "inquirerId",
  as: "inquirerInquiries",
});

PropertyInquiry.belongsTo(User, {
  foreignKey: "inquirerId",
  as: "inquirer",
});

// User (Sales Exec) -> PropertyInquiry (1:M)
User.hasMany(PropertyInquiry, {
  foreignKey: "assignedTo",
  as: "assignedInquiries",
});

PropertyInquiry.belongsTo(User, {
  foreignKey: "assignedTo",
  as: "clientDealer",
});

// ============================================
// EXPORTS
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
  SalesRelationship,
  PropertyManagerNotes,
  PropertyInquiry, // ✅ NEW: Export the model
};
