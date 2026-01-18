const { Op } = require('sequelize');
const User = require('../models/user');
const UserRole = require('../models/userRole');
const { isValidEmail, isValidPhone, validateRequiredFields } = require('../utils/validators');
const createAppError = require('../utils/appError');

const signup = async (req, res, next) => {
  try {
    const { mobileNumber, email, firstName, lastName, reraNumber, roleName } = req.body;

    // Validate required fields
    const requiredFields = ['mobileNumber', 'email', 'firstName', 'lastName'];
    const missing = validateRequiredFields(requiredFields, req.body);

    if (missing.length > 0) {
      return next(createAppError(`Missing required fields: ${missing.join(', ')}`, 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(createAppError('Invalid email format', 400));
    }

    // Validate mobile number (10 digits, starts with 6-9)
    if (!isValidPhone(mobileNumber)) {
      return next(
        createAppError('Invalid mobile number. Must be 10 digits starting with 6-9', 400)
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ mobileNumber }, { email }],
      },
      attributes: ['mobileNumber', 'email'],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return next(createAppError('Email already exists', 409));
      } else {
        return next(createAppError('Mobile number already exists', 409));
      }
    }

    // Prepare role name
    const role_name = ['investor', 'owner'].includes(roleName?.toLowerCase())
      ? roleName.toLowerCase()
      : 'broker';

    // Create user
    const createUser = await User.create({
      firstName,
      lastName,
      email,
      mobileNumber,
      isActive: true,
      reraNumber: reraNumber || null,
    });

    // Create user role
    const createRole = await UserRole.create({
      userId: createUser.userId,
      roleName: role_name,
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        userId: createUser.userId,
        role: createRole.roleName,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { signup };
