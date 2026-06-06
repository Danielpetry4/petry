/**
 * Admin dashboard routes.
 * Protected by admin auth middleware.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const { adminLogin, adminWebMiddleware } = require('../middleware/auth');
const { generateId } = require('../utils/helpers');
const { sendDownloadLinkRenewal } = require('../utils/email');

// Multer config for PDF upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'guide.pdf');
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// ========== PUBLIC ADMIN ROUTES (login) ==========

// Admin login page
router.get('/login', (req, res) => {
  res.render('admin/login', {
    title: 'Admin Login',
    error: null
  });
});

// Admin login POST
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('admin/login', {
      title: 'Admin Login',
      error: 'Email and password are required'
    });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(email);

  if (!admin) {
    return res.render('admin/login', {
      title: 'Admin Login',
      error: 'Invalid credentials'
    });
  }

  const bcrypt = require('bcryptjs');
  if (!bcrypt.compareSync(password, admin.password_hash)) {
    return res.render('admin/login', {
      title: 'Admin Login',
      error: 'Invalid credentials'
    });
  }

  // Set session
  req.session.adminId = admin.id;
  req.session.adminEmail = admin.email;
  req.session.adminName = admin.name;

  // Update last login
  db.prepare('UPDATE admin_users SET last_login_at = datetime(\'now\') WHERE id = ?').run(admin.id);

  res.redirect('/admin');
});

// Admin logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ========== PROTECTED ADMIN ROUTES ==========

// Dashboard
router.get('/', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const period = '30d';

  const stats = {
    totalOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as revenue FROM orders WHERE status = 'completed'").get().revenue,
    totalCustomers: db.prepare("SELECT COUNT(*) as count FROM customers").get().count,
    recentOrders: db.prepare(`
      SELECT o.*, c.email as customer_email, c.name as customer_name
      FROM orders o JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC LIMIT 10
    `).all(),
    pendingSupport: db.prepare("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'").get().count,
    unresolvedFlags: db.prepare("SELECT COUNT(*) as count FROM compliance_flags WHERE resolved = 0").get().count,
    monthRevenue: db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as revenue 
      FROM orders 
      WHERE status = 'completed' AND created_at >= datetime('now', '-30 days')
    `).get().revenue,
    monthOrders: db.prepare(`
      SELECT COUNT(*) as count 
      FROM orders 
      WHERE status = 'completed' AND created_at >= datetime('now', '-30 days')
    `).get().count,
    refundRate: (() => {
      const total = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").get().count;
      const refunded = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'refunded'").get().count;
      return total > 0 ? ((refunded / total) * 100).toFixed(2) : '0.00';
    })()
  };

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    stats,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Customers list
router.get('/customers', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const customers = db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM orders WHERE customer_id = c.id AND status = 'completed') as total_spent
    FROM customers c
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare("SELECT COUNT(*) as count FROM customers").get().count;

  res.render('admin/customers', {
    title: 'Customers',
    customers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Customer detail
router.get('/customers/:id', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.redirect('/admin/customers');

  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id);
  const downloadLinks = db.prepare(`
    SELECT dl.* FROM download_links dl
    JOIN orders o ON dl.order_id = o.id
    WHERE o.customer_id = ?
    ORDER BY dl.created_at DESC
  `).all(customer.id);

  res.render('admin/customer-detail', {
    title: `Customer: ${customer.email}`,
    customer, orders, downloadLinks,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Orders list
router.get('/orders', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status || '';

  let query = `
    SELECT o.*, c.email as customer_email, c.name as customer_name
    FROM orders o JOIN customers c ON o.customer_id = c.id
  `;
  let countQuery = "SELECT COUNT(*) as count FROM orders o JOIN customers c ON o.customer_id = c.id";
  const params = [];

  if (statusFilter) {
    query += " WHERE o.status = ?";
    countQuery += " WHERE o.status = ?";
    params.push(statusFilter);
  }

  query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const orders = db.prepare(query).all(...params);
  const total = db.prepare(countQuery).get(...(statusFilter ? [statusFilter] : [])).count;

  res.render('admin/orders', {
    title: 'Orders',
    orders,
    statusFilter,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Order detail
router.get('/orders/:id', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, c.email as customer_email, c.name as customer_name, p.name as product_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN products p ON o.product_id = p.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.redirect('/admin/orders');

  const downloadLinks = db.prepare('SELECT * FROM download_links WHERE order_id = ?').all(order.id);
  const downloadEvents = db.prepare(`
    SELECT de.* FROM download_events de
    JOIN download_links dl ON de.download_link_id = dl.id
    WHERE dl.order_id = ?
    ORDER BY de.created_at DESC LIMIT 20
  `).all(req.params.id);

  res.render('admin/order-detail', {
    title: `Order: ${order.id}`,
    order, downloadLinks, downloadEvents,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Process refund
router.post('/orders/:id/refund', adminWebMiddleware, async (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

  if (!order || order.status === 'refunded') {
    return res.redirect(`/admin/orders/${req.params.id}?error=already_refunded`);
  }

  try {
    if (order.stripe_payment_intent_id && process.env.STRIPE_SECRET_KEY) {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id });
    }

    db.prepare("UPDATE orders SET status = 'refunded', refund_status = 'refunded', refunded_at = datetime('now') WHERE id = ?")
      .run(order.id);
    db.prepare("UPDATE download_links SET is_revoked = 1 WHERE order_id = ?").run(order.id);

    // Track refund event
    db.prepare(`
      INSERT INTO analytics_events (id, event_type, customer_id, metadata)
      VALUES (?, 'purchase_refunded', ?, ?)
    `).run(generateId(), order.customer_id, JSON.stringify({ order_id: order.id }));

    res.redirect(`/admin/orders/${req.params.id}?success=refunded`);
  } catch (err) {
    console.error('Refund error:', err);
    res.redirect(`/admin/orders/${req.params.id}?error=${encodeURIComponent(err.message)}`);
  }
});

// Renew download link
router.post('/download-links/:id/renew', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const link = db.prepare('SELECT * FROM download_links WHERE id = ?').get(req.params.id);

  if (!link) return res.redirect('/admin/orders?error=link_not_found');

  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 7);

  db.prepare(`
    UPDATE download_links SET expires_at = ?, download_count = 0, is_revoked = 0
    WHERE id = ?
  `).run(newExpiry.toISOString(), req.params.id);

  // Send renewal email if customer exists
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(link.customer_id);
  if (customer) {
    const renewedLink = db.prepare('SELECT * FROM download_links WHERE id = ?').get(req.params.id);
    sendDownloadLinkRenewal(customer, renewedLink).catch(err => {
      console.error('Renewal email failed:', err.message);
    });
  }

  res.redirect(`/admin/orders?success=link_renewed`);
});

// Revoke download link
router.post('/download-links/:id/revoke', adminWebMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE download_links SET is_revoked = 1 WHERE id = ?').run(req.params.id);
  res.redirect(req.get('Referer') || '/admin/orders');
});

// Support tickets
router.get('/support', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const status = req.query.status || 'all';

  let tickets;
  if (status === 'all') {
    tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
  } else {
    tickets = db.prepare('SELECT * FROM support_tickets WHERE status = ? ORDER BY created_at DESC').all(status);
  }

  res.render('admin/support', {
    title: 'Support Tickets',
    tickets,
    statusFilter: status,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Support ticket detail / close
router.post('/support/:id/close', adminWebMiddleware, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE support_tickets SET status = 'resolved', resolved_at = datetime('now'), admin_notes = ?
    WHERE id = ?
  `).run(req.body.notes || null, req.params.id);
  res.redirect('/admin/support');
});

// Compliance logs
router.get('/compliance', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const resolved = req.query.resolved || 'all';

  let flags;
  if (resolved === 'all') {
    flags = db.prepare(`
      SELECT cf.*, acl.message as chat_message
      FROM compliance_flags cf
      LEFT JOIN ai_chat_logs acl ON cf.ai_chat_log_id = acl.id
      ORDER BY cf.created_at DESC LIMIT 100
    `).all();
  } else {
    const resolvedInt = resolved === '1' ? 1 : 0;
    flags = db.prepare(`
      SELECT cf.*, acl.message as chat_message
      FROM compliance_flags cf
      LEFT JOIN ai_chat_logs acl ON cf.ai_chat_log_id = acl.id
      WHERE cf.resolved = ?
      ORDER BY cf.created_at DESC LIMIT 100
    `).all(resolvedInt);
  }

  res.render('admin/compliance', {
    title: 'Compliance Logs',
    flags,
    resolvedFilter: resolved,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Resolve compliance flag
router.post('/compliance/:id/resolve', adminWebMiddleware, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE compliance_flags SET resolved = 1, resolved_at = datetime('now') WHERE id = ?")
    .run(req.params.id);
  res.redirect('/admin/compliance');
});

// PDF upload page
router.get('/pdf', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get('default-product');

  let fileInfo = null;
  if (product.file_path) {
    const filePath = path.isAbsolute(product.file_path)
      ? product.file_path
      : path.join(__dirname, '..', product.file_path);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      fileInfo = {
        size: stats.size,
        sizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        lastModified: stats.mtime,
        path: filePath
      };
    }
  }

  res.render('admin/pdf', {
    title: 'Manage PDF Guide',
    product,
    fileInfo,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Upload PDF
router.post('/pdf/upload', adminWebMiddleware, upload.single('pdf'), (req, res) => {
  const db = getDb();
  const file = req.file;

  if (!file) {
    return res.redirect('/admin/pdf?error=no_file');
  }

  db.prepare(`
    UPDATE products SET file_path = ?, file_size = ?, file_mime_type = 'application/pdf', updated_at = datetime('now')
    WHERE id = 'default-product'
  `).run(file.path, file.size);

  res.redirect('/admin/pdf?success=uploaded');
});

// Email logs
router.get('/email-logs', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  const logs = db.prepare('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM email_logs').get().count;

  res.render('admin/email-logs', {
    title: 'Email Logs',
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Settings / pricing
router.get('/settings', adminWebMiddleware, (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get('default-product');

  res.render('admin/settings', {
    title: 'Settings',
    product,
    admin: { email: req.session.adminEmail, name: req.session.adminName }
  });
});

// Update price
router.post('/settings/price', adminWebMiddleware, (req, res) => {
  const { price_cents } = req.body;
  const cents = parseInt(price_cents);

  if (!cents || cents < 100 || cents > 99999) {
    return res.redirect('/admin/settings?error=invalid_price');
  }

  const db = getDb();
  db.prepare('UPDATE products SET price_cents = ?, updated_at = datetime(\'now\') WHERE id = \'default-product\'').run(cents);

  res.redirect('/admin/settings?success=price_updated');
});

// Update product info
router.post('/settings/product', adminWebMiddleware, (req, res) => {
  const { name, description } = req.body;
  const db = getDb();
  db.prepare('UPDATE products SET name = ?, description = ?, updated_at = datetime(\'now\') WHERE id = \'default-product\'')
    .run(name, description);
  res.redirect('/admin/settings?success=product_updated');
});

module.exports = router;