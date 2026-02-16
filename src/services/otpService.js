const createAppError = require("../utils/appError");

const BASE_URL =
  process.env.MESSAGECENTRAL_BASE_URL || "https://cpaas.messagecentral.com";
const CUSTOMER_ID = process.env.MESSAGECENTRAL_CUSTOMER_ID;
const PASSWORD = process.env.MESSAGECENTRAL_PASSWORD;

let cachedToken = null;
let tokenExpiresAt = null;

const getAuthToken = async () => {
  // Return cached token if still valid (refresh 5 min before expiry)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!CUSTOMER_ID || !PASSWORD) {
    throw createAppError("MessageCentral credentials not configured", 500);
  }

  const encodedPassword = Buffer.from(PASSWORD).toString("base64");

  const url = `${BASE_URL}/auth/v1/authentication/token?customerId=${CUSTOMER_ID}&key=${encodeURIComponent(encodedPassword)}&scope=NEW&country=91`;

  const response = await fetch(url, { method: "GET" });
  const data = await response.json();

  if (!response.ok || !data.token) {
    throw createAppError("Failed to get MessageCentral auth token", 500);
  }

  cachedToken = data.token;
  // Cache for 20 minutes (MessageCentral tokens are typically valid for ~24h)
  tokenExpiresAt = Date.now() + 20 * 60 * 1000;

  return cachedToken;
};

const sendOtp = async (mobileNumber) => {
  const token = await getAuthToken();

  const url = `${BASE_URL}/verification/v3/send?countryCode=91&flowType=SMS&mobileNumber=${mobileNumber}&otpLength=6&customerId=${CUSTOMER_ID}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authToken: token,
    },
  });

  const data = await response.json();

  if (data.responseCode !== 200 || !data.data?.verificationId) {
    // Reset token cache on auth failure
    if (response.status === 401) {
      cachedToken = null;
      tokenExpiresAt = null;
    }

    const errorMessage =
      data.message || "Failed to send OTP. Please try again.";
    throw createAppError(errorMessage, 400);
  }

  return {
    verificationId: data.data.verificationId,
    timeout: data.data.timeout,
  };
};

const verifyOtp = async (verificationId, code) => {
  const token = await getAuthToken();

  const url = `${BASE_URL}/verification/v3/validateOtp?verificationId=${verificationId}&code=${code}&flowType=SMS`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      authToken: token,
    },
  });

  const data = await response.json();

  if (data.responseCode === 702) {
    throw createAppError("Invalid OTP entered", 400);
  }

  if (data.responseCode === 705) {
    throw createAppError("OTP has expired. Please request a new one.", 400);
  }

  if (data.responseCode === 800) {
    throw createAppError(
      "Maximum verification attempts reached. Please request a new OTP.",
      429
    );
  }

  if (
    data.responseCode !== 200 ||
    data.data?.verificationStatus !== "VERIFICATION_COMPLETED"
  ) {
    throw createAppError(
      data.message || "OTP verification failed. Please try again.",
      400
    );
  }

  return { verified: true };
};

module.exports = { sendOtp, verifyOtp };
