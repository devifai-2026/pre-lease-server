const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile
  return phoneRegex.test(phone);
};

const isValidReraNumber = (rera) => {
  const reraRegex = /^[A-Z]{2}RERA\/[A-Z0-9]+$/;
  return reraRegex.test(rera);
};

const sanitizeString = (str) => {
  if (!str) return "";
  return str.trim().replace(/[<>]/g, "");
};

const validateRequiredFields = (fields, data) => {
  const missing = [];
  fields.forEach((field) => {
    const value = data[field];
    // Treat only undefined / null / empty-string / whitespace as missing.
    // 0 and false are valid values (e.g. dealsClosed: 0) and must NOT be flagged.
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      missing.push(field);
    }
  });
  return missing;
};

// Safe pagination: guards NaN/negative and caps the page size to avoid DoS via huge limits.
const MAX_PAGE_SIZE = 100;
const getPagination = (page, limit, defaultLimit = 10) => {
  let pageNumber = parseInt(page, 10);
  let pageSize = parseInt(limit, 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) pageNumber = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultLimit;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;
  const offset = (pageNumber - 1) * pageSize;
  return { pageNumber, pageSize, offset };
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidReraNumber,
  sanitizeString,
  validateRequiredFields,
  getPagination,
  MAX_PAGE_SIZE,
};
