/**
 * Public routes: landing page, product info, FAQ, support, legal pages.
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { sendSupportConfirmation } = require('../utils/email');
const { generateId, isValidEmail } = require('../utils/helpers');

// Landing page
router.get('/', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get('default-product');
  
  res.render('pages/index', {
    title: 'Better Credit Guide - Take Control of Your Credit',
    product: product || { id: 'default-product', name: 'DIY Credit Report & Credit Building Guide', description: 'A comprehensive educational PDF guide.', price_cents: 2900 },
    currentPage: 'home'
  });
});

// Product / pricing page
router.get('/product', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get('default-product');
  
  res.render('pages/product', {
    title: 'Better Credit Guide - Purchase',
    product: product || { id: 'default-product', name: 'DIY Credit Report & Credit Building Guide', description: 'A comprehensive educational PDF guide.', price_cents: 2900 },
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    currentPage: 'product'
  });
});

// FAQ page
router.get('/faq', (req, res) => {
  res.render('pages/faq', {
    title: 'Frequently Asked Questions',
    currentPage: 'faq'
  });
});

// Support page
router.get('/support', (req, res) => {
  res.render('pages/support', {
    title: 'Contact Support',
    currentPage: 'support'
  });
});

// Support form submission
router.post('/support', (req, res) => {
  const { name, email, subject, message } = req.body;
  
  if (!email || !subject || !message) {
    return res.status(400).render('pages/support', {
      title: 'Contact Support',
      currentPage: 'support',
      error: 'Please fill in all required fields.',
      formData: req.body
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).render('pages/support', {
      title: 'Contact Support',
      currentPage: 'support',
      error: 'Please enter a valid email address.',
      formData: req.body
    });
  }

  const db = getDb();
  const ticketId = generateId();

  db.prepare(`
    INSERT INTO support_tickets (id, email, name, subject, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticketId, email, name || 'Anonymous', subject, message);

  // Send confirmation email (don't block on failure)
  sendSupportConfirmation(name || 'there', email, ticketId).catch(err => {
    console.error('Support confirmation email failed:', err.message);
  });

  res.render('pages/support', {
    title: 'Contact Support',
    currentPage: 'support',
    success: `Your support ticket (${ticketId}) has been submitted. We'll get back to you soon.`
  });
});

// Privacy policy
router.get('/privacy', (req, res) => {
  res.render('pages/privacy', {
    title: 'Privacy Policy',
    currentPage: 'privacy'
  });
});

// Terms of service
router.get('/terms', (req, res) => {
  res.render('pages/terms', {
    title: 'Terms of Service',
    currentPage: 'terms'
  });
});

// Refund policy
router.get('/refund-policy', (req, res) => {
  res.render('pages/refund-policy', {
    title: 'Refund Policy',
    currentPage: 'refund-policy'
  });
});

// Educational Disclaimer
router.get('/disclaimer', (req, res) => {
  res.render('pages/disclaimer', {
    title: 'Disclaimer',
    currentPage: 'disclaimer'
  });
});

module.exports = router;
