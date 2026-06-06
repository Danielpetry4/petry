/**
 * Admin authentication middleware using JWT.
 */
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

function adminLogin(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ? AND is_active = 1').get(email);
  
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const bcrypt = require('bcryptjs');
  if (!bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last login
  db.prepare('UPDATE admin_users SET last_login_at = datetime(\'now\') WHERE id = ?').run(admin.id);

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET || 'dev-jwt-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    }
  });
}

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Also check session cookie for web admin
    if (req.session && req.session.adminId) {
      req.admin = { id: req.session.adminId, email: req.session.adminEmail };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminWebMiddleware(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  
  // Allow API access via Bearer token for AJAX
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return adminAuthMiddleware(req, res, next);
  }
  
  res.redirect('/admin/login');
}

module.exports = { adminLogin, adminAuthMiddleware, adminWebMiddleware };