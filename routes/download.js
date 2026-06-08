/**
 * Download route: secure PDF delivery with token validation, 7-day expiry, and download limits.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { getDb } = require('../config/database');
const { generateId, isExpired } = require('../utils/helpers');

/**
 * Download a product via a secure token.
 * Validates: token existence, not expired, not revoked, download count limit.
 */
router.get('/:token', (req, res) => {
  const { token } = req.params;
  const db = getDb();

  // Find the download link
  const downloadLink = db.prepare('SELECT * FROM download_links WHERE token = ?').get(token);

  if (!downloadLink) {
    return res.status(404).render('pages/download-error', {
      title: 'Download Link Not Found',
      error: 'This download link could not be found. It may have been removed or the URL is incorrect.',
      errorCode: 'NOT_FOUND'
    });
  }

  // Check if revoked
  if (downloadLink.is_revoked) {
    // Log the failed attempt
    const eventId = generateId();
    db.prepare(`
      INSERT INTO download_events (id, download_link_id, ip_address, user_agent, success, reason)
      VALUES (?, ?, ?, ?, 0, 'link_revoked')
    `).run(eventId, downloadLink.id, req.ip || req.connection.remoteAddress, req.headers['user-agent'] || null);

    return res.status(403).render('pages/download-error', {
      title: 'Download Link Revoked',
      error: 'This download link has been revoked. If you believe this is an error, please contact support.',
      errorCode: 'REVOKED'
    });
  }

  // Check expiry
  if (isExpired(downloadLink.expires_at)) {
    const eventId = generateId();
    db.prepare(`
      INSERT INTO download_events (id, download_link_id, ip_address, user_agent, success, reason)
      VALUES (?, ?, ?, ?, 0, 'expired')
    `).run(eventId, downloadLink.id, req.ip || req.connection.remoteAddress, req.headers['user-agent'] || null);

    return res.status(410).render('pages/download-error', {
      title: 'Download Link Expired',
      error: 'This download link has expired. Links are valid for 7 days from purchase. Please contact support for a new link.',
      errorCode: 'EXPIRED'
    });
  }

  // Check download count
  if (downloadLink.download_count >= downloadLink.max_downloads) {
    const eventId = generateId();
    db.prepare(`
      INSERT INTO download_events (id, download_link_id, ip_address, user_agent, success, reason)
      VALUES (?, ?, ?, ?, 0, 'max_downloads_exceeded')
    `).run(eventId, downloadLink.id, req.ip || req.connection.remoteAddress, req.headers['user-agent'] || null);

    return res.status(429).render('pages/download-error', {
      title: 'Download Limit Reached',
      error: 'This download link has reached its maximum number of downloads. Please contact support for assistance.',
      errorCode: 'LIMIT_EXCEEDED'
    });
  }

  // Get the product file
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(downloadLink.order_id);
  if (!order) {
    return res.status(404).render('pages/download-error', {
      title: 'Order Not Found',
      error: 'The order associated with this download link could not be found.',
      errorCode: 'ORDER_NOT_FOUND'
    });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);
  if (!product) {
    return res.status(404).render('pages/download-error', {
      title: 'Product Not Found',
      error: 'The product associated with this download could not be found.',
      errorCode: 'PRODUCT_NOT_FOUND'
    });
  }

  // Determine file path
  const filePath = product.file_path 
    ? (path.isAbsolute(product.file_path) 
        ? product.file_path 
        : path.join(__dirname, '..', product.file_path))
    : null;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).render('pages/download-error', {
      title: 'File Not Available',
      error: 'The guide file is temporarily unavailable. Please try again later or contact support.',
      errorCode: 'FILE_NOT_FOUND'
    });
  }

  // Increment download count
  db.prepare(`
    UPDATE download_links 
    SET download_count = download_count + 1, last_downloaded_at = datetime('now')
    WHERE id = ?
  `).run(downloadLink.id);

  // Log successful download event
  const eventId = generateId();
  db.prepare(`
    INSERT INTO download_events (id, download_link_id, ip_address, user_agent, success)
    VALUES (?, ?, ?, ?, 1)
  `).run(eventId, downloadLink.id, req.ip || req.connection.remoteAddress, req.headers['user-agent'] || null);

  // Track analytics
  db.prepare(`
    INSERT INTO analytics_events (id, event_type, customer_id, metadata)
    VALUES (?, 'download_completed', ?, ?)
  `).run(
    generateId(),
    downloadLink.customer_id,
    JSON.stringify({ download_link_id: downloadLink.id, order_id: downloadLink.order_id })
  );

  // Send the file
  const filename = product.name.replace(/[^a-zA-Z0-9 ]/g, '').trim() + '.pdf';
  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).render('pages/download-error', {
          title: 'Download Error',
          error: 'An error occurred while downloading the file. Please try again.',
          errorCode: 'DOWNLOAD_ERROR'
        });
      }
    }
  });
});

module.exports = router;
