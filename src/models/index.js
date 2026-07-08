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
const InquiryStage = require("./inquiryStage");
const InquiryStatusHistory = require("./inquiryStatusHistory");
const InquiryMessage = require("./inquiryMessage");
const PropertyNotificationEvent = require("./propertyNotificationEvent");
const PropertyVerificationLog = require("./propertyVerificationLog");
const PropertyLike = require("./propertyLike");
const BrokerProfile = require("./brokerProfile");
const Blog = require("./blog");
const SupportRequest = require("./supportRequest");
const ContactLead = require("./contactLead");
const Category = require("./category");

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

// ============================================
// ROLE <-> PERMISSION ASSOCIATIONS (FIXED)
// ============================================

// ✅ Many-to-Many: Role <-> Permission through RolePermission
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: "roleId",
  otherKey: "permissionId",
  as: "permissions", // plural for the many-to-many
});

Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: "permissionId",
  otherKey: "roleId",
  as: "roles", // plural for the many-to-many
});

// ✅ Direct associations on junction table (for querying RolePermission directly)
// Use different aliases to avoid conflicts
RolePermission.belongsTo(Role, {
  foreignKey: "roleId",
  as: "roleDetail", // ← Changed from "role" to avoid conflict
});

RolePermission.belongsTo(Permission, {
  foreignKey: "permissionId",
  as: "permissionDetail", // ← Changed from "permission" to avoid conflict
});

RolePermission.belongsTo(User, {
  foreignKey: "grantedBy",
  as: "grantedByUser",
});

// ✅ Reverse associations (optional, for direct junction queries)
Role.hasMany(RolePermission, {
  foreignKey: "roleId",
  as: "rolePermissionMappings", // ← Different alias
});

Permission.hasMany(RolePermission, {
  foreignKey: "permissionId",
  as: "rolePermissionMappings", // ← Different alias
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
// PROPERTY MANAGER NOTES ASSOCIATIONS
// ============================================

// Property <-> PropertyManagerNotes (One-to-Many)
Property.hasMany(PropertyManagerNotes, {
  foreignKey: "propertyId",
  as: "managerNotes",
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

// User (Edited By) <-> PropertyManagerNotes (One-to-Many)
User.hasMany(PropertyManagerNotes, {
  foreignKey: "editedBy",
  as: "editedNotes",
});
PropertyManagerNotes.belongsTo(User, {
  foreignKey: "editedBy",
  as: "editor",
});

// User (Approved By) <-> PropertyManagerNotes (One-to-Many)
User.hasMany(PropertyManagerNotes, {
  foreignKey: "approvedBy",
  as: "approvedNotes",
});
PropertyManagerNotes.belongsTo(User, {
  foreignKey: "approvedBy",
  as: "approver",
});

// ✅ NEW — User (Created By) <-> PropertyManagerNotes (One-to-Many)
User.hasMany(PropertyManagerNotes, {
  foreignKey: "createdBy",
  as: "createdNotes",
});
PropertyManagerNotes.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

// ✅ NEW — User (Updated By) <-> PropertyManagerNotes (One-to-Many)
User.hasMany(PropertyManagerNotes, {
  foreignKey: "updatedBy",
  as: "updatedNotes",
});
PropertyManagerNotes.belongsTo(User, {
  foreignKey: "updatedBy",
  as: "updater",
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
// PROPERTY INQUIRIES ASSOCIATIONS
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

// InquiryStage <-> PropertyInquiry (current stage)
InquiryStage.hasMany(PropertyInquiry, {
  foreignKey: "stageId",
  as: "inquiries",
});
PropertyInquiry.belongsTo(InquiryStage, {
  foreignKey: "stageId",
  as: "stage",
});

// PropertyInquiry -> InquiryStatusHistory (timeline)
PropertyInquiry.hasMany(InquiryStatusHistory, {
  foreignKey: "inquiryId",
  as: "statusHistory",
});
InquiryStatusHistory.belongsTo(PropertyInquiry, {
  foreignKey: "inquiryId",
  as: "inquiry",
});
InquiryStatusHistory.belongsTo(InquiryStage, {
  foreignKey: "stageId",
  as: "stage",
});
InquiryStatusHistory.belongsTo(User, {
  foreignKey: "changedBy",
  as: "changedByUser",
});

// PropertyInquiry -> InquiryMessage (conversation thread)
PropertyInquiry.hasMany(InquiryMessage, {
  foreignKey: "inquiryId",
  as: "messages",
});
InquiryMessage.belongsTo(PropertyInquiry, {
  foreignKey: "inquiryId",
  as: "inquiry",
});
InquiryMessage.belongsTo(User, {
  foreignKey: "senderId",
  as: "sender",
});

Property.hasMany(PropertyNotificationEvent, {
  foreignKey: "property_id",
  as: "notificationEvents",
});

User.hasMany(PropertyNotificationEvent, {
  foreignKey: "user_id",
  as: "userNotifications",
});

PropertyNotificationEvent.belongsTo(Property, {
  foreignKey: "property_id",
  as: "property",
});

PropertyNotificationEvent.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// Support requests (optionally linked to a logged-in user)
SupportRequest.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// Contact-us leads (optionally linked to a logged-in user)
ContactLead.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// ============================================
// PROPERTY VERIFICATION LOG ASSOCIATIONS
// ============================================

// Property -> PropertyVerificationLog (1:M)
Property.hasMany(PropertyVerificationLog, {
  foreignKey: "propertyId",
  as: "verificationLogs",
  onDelete: "CASCADE",
});
PropertyVerificationLog.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

// User -> PropertyVerificationLog (1:M)
User.hasMany(PropertyVerificationLog, {
  foreignKey: "userId",
  as: "verificationLogs",
  onDelete: "CASCADE",
});
PropertyVerificationLog.belongsTo(User, {
  foreignKey: "userId",
  as: "verifiedBy",
});

// ============================================
// BROKER PROFILE ASSOCIATIONS
// ============================================

// User <-> BrokerProfile (One-to-One)
User.hasOne(BrokerProfile, { foreignKey: "userId", as: "brokerProfile" });
BrokerProfile.belongsTo(User, { foreignKey: "userId", as: "user" });

// ============================================
// PROPERTY LIKE (WISHLIST) ASSOCIATIONS
// ============================================

Property.hasMany(PropertyLike, {
  foreignKey: "propertyId",
  as: "likes",
  onDelete: "CASCADE",
});
PropertyLike.belongsTo(Property, {
  foreignKey: "propertyId",
  as: "property",
});

User.hasMany(PropertyLike, {
  foreignKey: "userId",
  as: "propertyLikes",
  onDelete: "CASCADE",
});
PropertyLike.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
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
  PropertyInquiry,
  InquiryStage,
  InquiryStatusHistory,
  InquiryMessage,
  PropertyNotificationEvent,
  PropertyVerificationLog,
  PropertyLike,
  BrokerProfile,
  Blog,
  SupportRequest,
  ContactLead,
  Category,
};
