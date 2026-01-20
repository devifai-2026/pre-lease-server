// middleware/auth.js
const Token = require("../models/token");
const createAppError = require("../utils/appError");

const authenticateUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(createAppError("No access token provided", 401));
    }

    const accessToken = authHeader.split(" ")[1];

    // Verify access token
    const { valid, decoded, message, expired } =
      Token.verifyAccessToken(accessToken);

    if (!valid) {
      // Create error and attach expired flag
      const error = createAppError(message, 401);
      error.expired = expired; // ✅ Add expired flag
      return next(error);
    }

    // Attach user info to request
    req.user = {
      userId: decoded._id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticateUser };
