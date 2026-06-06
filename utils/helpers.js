/**
 * Utility functions for the application.
 */
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a UUID v4.
 */
function generateId() {
  return uuidv4();
}

/**
 * Generate a secure random token for download links.
 */
function generateToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Format cents to dollars string.
 */
function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * Get expiry date for download link (default: 7 days from now).
 */
function getDownloadExpiry(days = 7) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Check if a date string has expired.
 */
function isExpired(dateStr) {
  return new Date(dateStr) < new Date();
}

/**
 * Sanitize a string for safe display/logging.
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, function (m) {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '&') return '&amp;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#39;';
    return m;
  });
}

/**
 * Validate email format.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  generateId,
  generateToken,
  formatPrice,
  getDownloadExpiry,
  isExpired,
  sanitize,
  isValidEmail
};