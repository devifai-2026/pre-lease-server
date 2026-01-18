const { sequelize } = require('../config/dbConnection');
const User = require('./user');
const Permission = require('./permission');
const UserRole = require('./userRole');

// Define associations
User.hasMany(UserRole, {
  foreignKey: 'user_id',
  as: 'roles',
});

UserRole.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

module.exports = {
  sequelize,
  User,
  Permission,
  UserRole,
};
