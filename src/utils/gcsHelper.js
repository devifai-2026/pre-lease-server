// utils/gcsHelper.js
const { bucket } = require("../config/gcsClient");

// Parse expiry string like "7d", "24h", "30m" into milliseconds
const parseExpiry = (expiryStr) => {
  const defaultExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (!expiryStr) return defaultExpiry;

  const match = expiryStr.match(/^(\d+)([dhm])$/);
  if (!match) return defaultExpiry;

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "m":
      return value * 60 * 1000;
    default:
      return defaultExpiry;
  }
};

/**
 * Generate a signed URL for a GCS object
 * @param {string} gcsPath - The object path in the bucket
 * @returns {Promise<string>} - The signed URL
 */
const getSignedUrl = async (gcsPath) => {
  if (!gcsPath) return null;

  const expiryMs = parseExpiry(process.env.GCS_SIGNED_URL_EXPIRY);

  const [url] = await bucket.file(gcsPath).getSignedUrl({
    version: "v4",
    action: "read",   
    expires: Date.now() + expiryMs,
  });

  return url;
};

/**
 * Generate signed URLs for an array of media records
 * @param {Array} mediaRecords - Array of objects with fileUrl property (GCS path)
 * @returns {Promise<Array>} - Same array with fileUrl replaced by signed URLs
 */
const attachSignedUrls = async (mediaRecords) => {
  if (!mediaRecords || mediaRecords.length === 0) return mediaRecords;

  return Promise.all(
    mediaRecords.map(async (record) => {
      const data = record.toJSON ? record.toJSON() : { ...record };
      if (data.fileUrl) {
        data.fileUrl = await getSignedUrl(data.fileUrl);
      }
      return data;
    })
  );
};

module.exports = { getSignedUrl, attachSignedUrls };
