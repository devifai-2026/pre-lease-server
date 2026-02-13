const zlib = require("zlib");

/**
 * Compress and base64 encode the data field in response
 * @param {Object} data - The data object to encode
 * @returns {String} - Base64 encoded compressed string
 */
const encodeData = (data) => {
  try {
    // Convert data to JSON string
    const jsonString = JSON.stringify(data);

    // Compress using zlib deflate
    const compressed = zlib.deflateSync(jsonString);

    // Convert to base64
    const base64Encoded = compressed.toString("base64");

    return base64Encoded;
  } catch (error) {
    console.error("Error encoding data:", error);
    throw new Error("Failed to encode response data");
  }
};

/**
 * Decode base64 and decompress data (for client-side or testing)
 * @param {String} encodedData - Base64 encoded compressed string
 * @returns {Object} - Original data object
 */
const decodeData = (encodedData) => {
  try {
    // Convert from base64 to buffer
    const compressed = Buffer.from(encodedData, "base64");

    // Decompress using zlib inflate
    const decompressed = zlib.inflateSync(compressed);

    // Parse JSON string back to object
    const data = JSON.parse(decompressed.toString("utf8"));

    return data;
  } catch (error) {
    console.error("Error decoding data:", error);
    throw new Error("Failed to decode response data");
  }
};

/**
 * Wrapper to send encoded response
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {Boolean} success - Success flag
 * @param {String} message - Response message
 * @param {Object} data - Data to encode
 * @param {Object} additionalFields - Any additional fields (pagination, filters, etc.)
 */
const sendEncodedResponse = (
  res,
  statusCode,
  success,
  message,
  data,
  additionalFields = {}
) => {
  const response = {
    success,
    message,
    data: encodeData(data), // Encode only the data field
    ...additionalFields, // Include pagination, filters, etc. as plain text
  };
  // console.log(decodeData(response.data));
  return res.status(statusCode).json(response);
};

module.exports = {
  encodeData,
  decodeData,
  sendEncodedResponse,
};
