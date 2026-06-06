/**
 * Analytics event tracking API.
 * Captures page views, interactions, and other events for KPI measurement.
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { generateId } = require('../utils/helpers');

/**
 * POST /api/analytics/track - Track an analytics event.
 */
router.post('/track', (req, res) => {
  const { eventType, sessionId, pageUrl, metadata } = req.body;

  if (!eventType) {
    return res.status(400).json({ error: 'eventType is required' });
  }

  const validEvents = [
    'page_view', 'product_view', 'purchase_started', 'purchase_completed',
    'purchase_failed', 'download_completed', 'chat_started', 'chat_message',
    'faq_view', 'support_view', 'legal_view'
  ];

  if (!validEvents.includes(eventType)) {
    return res.status(400).json({ error: `Invalid eventType. Must be one of: ${validEvents.join(', ')}` });
  }

  const db = getDb();
  const eventId = generateId();

  db.prepare(`
    INSERT INTO analytics_events (id, event_type, session_id, page_url, metadata, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    eventType,
    sessionId || null,
    pageUrl || null,
    metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null,
    req.ip || req.connection.remoteAddress,
    req.headers['user-agent'] || null
  );

  res.json({ success: true, eventId });
});

/**
 * GET /api/analytics/summary - Get analytics summary (admin only).
 * This route is mounted under admin auth in the server.
 */
router.get('/summary', (req, res) => {
  const db = getDb();
  const period = req.query.period || '30d';
  
  let dateFilter;
  switch (period) {
    case '7d': dateFilter = "datetime('now', '-7 days')"; break;
    case '30d': dateFilter = "datetime('now', '-30 days')"; break;
    case '90d': dateFilter = "datetime('now', '-90 days')"; break;
    case '1y': dateFilter = "datetime('now', '-1 year')"; break;
    default: dateFilter = "datetime('now', '-30 days')";
  }

  const totalPageViews = db.prepare(`
    SELECT COUNT(*) as count FROM analytics_events 
    WHERE event_type = 'page_view' AND created_at >= ${dateFilter}
  `).get();

  const totalPurchases = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as revenue
    FROM orders WHERE status = 'completed' AND created_at >= ${dateFilter}
  `).get();

  const totalDownloads = db.prepare(`
    SELECT COUNT(*) as count FROM download_events
    WHERE success = 1 AND created_at >= ${dateFilter}
  `).get();

  const refundCount = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE status = 'refunded' AND created_at >= ${dateFilter}
  `).get();

  const chatCount = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as count FROM ai_chat_logs
    WHERE created_at >= ${dateFilter}
  `).get();

  const complianceFlagCount = db.prepare(`
    SELECT COUNT(*) as count FROM compliance_flags
    WHERE resolved = 0 AND created_at >= ${dateFilter}
  `).get();

  // Daily purchase data for charting
  const dailyPurchases = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as purchases, COALESCE(SUM(amount_cents), 0) as revenue
    FROM orders WHERE status = 'completed' AND created_at >= ${dateFilter}
    GROUP BY date(created_at) ORDER BY date ASC
  `).all();

  res.json({
    period,
    pageViews: totalPageViews.count,
    purchases: totalPurchases.count,
    revenue: totalPurchases.revenue,
    downloads: totalDownloads.count,
    refunds: refundCount.count,
    chatSessions: chatCount.count,
    unresolvedFlags: complianceFlagCount.count,
    dailyData: dailyPurchases,
    refundRate: totalPurchases.count > 0 
      ? ((refundCount.count / totalPurchases.count) * 100).toFixed(2)
      : '0.00'
  });
});

module.exports = router;