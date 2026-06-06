#!/usr/bin/env node

/**
 * DIY Credit Repair Guide - Main Server
 * Node.js/Express application with SQLite, Stripe, email, and admin dashboard.
 */
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');

// Database initialization
const { initializeDatabase, seedDefaultData } = require('./config/database');

// Initialize database on startup
console.log('Initializing database...');
initializeDatabase();
seedDefaultData();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Middleware ==========

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ========== Routes ==========

// Public routes
app.use('/', require('./routes/public'));

// Payment routes
app.use('/payment', require('./routes/payment'));

// Download routes
app.use('/download', require('./routes/download'));

// API routes - analytics and public API endpoints
const analyticsRoutes = require('./routes/analytics');
app.use('/api/analytics', analyticsRoutes);

// AI Chat API (mounted under /api)
const aiChatRoutes = require('./routes/aiChat');
app.use('/api', aiChatRoutes);

// Admin routes
app.use('/admin', require('./routes/admin'));

// API endpoint for admin JWT login (JSON)
app.post('/api/admin/login', (req, res) => {
  // Forward to the admin login logic
  const { adminLogin } = require('./middleware/auth');
  return adminLogin(req, res);
});

// ========== Health Check ==========
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ========== 404 Handler ==========
app.use((req, res) => {
  // Check if it's an API route
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('pages/download-error', {
    title: 'Page Not Found',
    error: 'The page you are looking for does not exist.',
    errorCode: 'NOT_FOUND'
  });
});

// ========== Error Handler ==========
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  
  res.status(500).render('pages/download-error', {
    title: 'Server Error',
    error: 'An unexpected error occurred. Please try again later.',
    errorCode: 'SERVER_ERROR'
  });
});

// ========== Start Server ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=== DIY Credit Repair Guide Server ===`);
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`App URL: ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  console.log(`====================================`);
});

module.exports = app;