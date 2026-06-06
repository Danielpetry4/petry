/**
 * Database initialization and connection module.
 * Creates all required tables and seeds default data.
 */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not installed. Run: npm install');
  process.exit(1);
}

function getDbPath() {
  return process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'app.db');
}

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  return dbInstance;
}

function initializeDatabase() {
  const db = getDb();

  console.log('Initializing database schema...');

  db.exec(`
    -- Products table: stores the PDF product info and metadata
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL DEFAULT 2900,
      file_path TEXT,
      file_size INTEGER,
      file_mime_type TEXT DEFAULT 'application/pdf',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Customers table: stores customer info from Stripe
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      stripe_customer_id TEXT UNIQUE,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Orders table: stores order/purchase records
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      stripe_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      refund_status TEXT,
      refunded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Download links table: secure per-purchase download tokens
    CREATE TABLE IF NOT EXISTS download_links (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      max_downloads INTEGER NOT NULL DEFAULT 5,
      download_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_downloaded_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Download events table: tracks each download attempt
    CREATE TABLE IF NOT EXISTS download_events (
      id TEXT PRIMARY KEY,
      download_link_id TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (download_link_id) REFERENCES download_links(id)
    );

    -- Support tickets table
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      email TEXT NOT NULL,
      name TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      admin_notes TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- AI chat logs table
    CREATE TABLE IF NOT EXISTS ai_chat_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      customer_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      message TEXT NOT NULL,
      was_truncated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Compliance flags table: tracks risky conversations
    CREATE TABLE IF NOT EXISTS compliance_flags (
      id TEXT PRIMARY KEY,
      ai_chat_log_id TEXT,
      session_id TEXT,
      customer_id TEXT,
      flag_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      reason TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ai_chat_log_id) REFERENCES ai_chat_logs(id)
    );

    -- Analytics events table
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      session_id TEXT,
      customer_id TEXT,
      page_url TEXT,
      metadata TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Admin users table
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Email log table
    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      template TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
    CREATE INDEX IF NOT EXISTS idx_download_links_token ON download_links(token);
    CREATE INDEX IF NOT EXISTS idx_download_links_order ON download_links(order_id);
    CREATE INDEX IF NOT EXISTS idx_download_events_link ON download_events(download_link_id);
    CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_session ON ai_chat_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_compliance_flags_session ON compliance_flags(session_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
  `);

  console.log('Database schema initialized successfully.');
  return db;
}

function seedDefaultData() {
  const db = getDb();

  // Check if we already have a default product
  const existingProduct = db.prepare('SELECT id FROM products WHERE id = ?').get('default-product');
  if (!existingProduct) {
    const productId = 'default-product';
    db.prepare(`
      INSERT INTO products (id, name, description, price_cents, file_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      productId,
      'DIY Credit Report &amp; Credit Building Guide',
      'A comprehensive educational PDF guide that teaches you how to review your credit reports, dispute errors, handle fraud, and build better credit habits.',
      2900,
      './data/guide.pdf'
    );
    console.log('Default product created.');
  }

  // Seed default admin user if none exists
  const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(process.env.ADMIN_EMAIL || 'admin@diycreditrepair.com');
  if (!existingAdmin) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@diycreditrepair.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(adminPassword, 10);
    const adminId = require('uuid').v4();
    db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, adminEmail, hash, 'Admin', 'superadmin');
    console.log(`Default admin user created: ${adminEmail}`);
  }

  console.log('Seed data created successfully.');
}

// Run directly
if (require.main === module) {
  require('dotenv').config();
  const db = initializeDatabase();
  seedDefaultData();
  console.log('Database initialization complete.');
  process.exit(0);
}

module.exports = { getDb, initializeDatabase, seedDefaultData };