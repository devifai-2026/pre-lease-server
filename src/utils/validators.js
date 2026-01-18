const isValidEmail = email => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = phone => {
  const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile
  return phoneRegex.test(phone);
};

const isValidReraNumber = rera => {
  const reraRegex = /^[A-Z]{2}RERA\/[A-Z0-9]+$/;
  return reraRegex.test(rera);
};

const sanitizeString = str => {
  if (!str) return '';
  return str.trim().replace(/[<>]/g, '');
};

const validateRequiredFields = (fields, data) => {
  const missing = [];
  fields.forEach(field => {
    if (!data[field]) {
      missing.push(field);
    }
  });
  return missing;
};

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidReraNumber,
  sanitizeString,
  validateRequiredFields,
};
