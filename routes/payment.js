/**
 * Stripe payment integration routes.
 * Handles Checkout session creation and webhook processing.
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { generateId, generateToken, getDownloadExpiry } = require('../utils/helpers');
const { sendPurchaseConfirmation } = require('../utils/email');

// Initialize Stripe
let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
  return stripe;
}

/**
 * Create a Stripe Checkout session.
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      console.error('STRIPE_PRICE_ID is not set in environment variables');
      return res.status(500).json({ error: 'Payment configuration error: missing price ID' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      console.error('STRIPE_SECRET_KEY is not set or is a placeholder');
      return res.status(500).json({ error: 'Payment configuration error: missing secret key' });
    }

    const successUrl = process.env.SUCCESS_URL || (process.env.APP_URL || 'http://localhost:3000') + '/payment/success?session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = process.env.CANCEL_URL || (process.env.APP_URL || 'http://localhost:3000') + '/product?canceled=true';
    const sessionId = generateId();

    console.log('Creating Stripe checkout session with price:', priceId);
    console.log('Success URL:', successUrl);
    console.log('Cancel URL:', cancelUrl);

    // Create a checkout session using the predefined price ID
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: req.body.customerEmail || undefined,
      metadata: {
        order_id: sessionId,
        product_id: 'default-product'
      }
    });

    console.log('Checkout session created:', session.id, session.url);
    res.json({ sessionUrl: session.url, sessionId: session.id });
  } catch (err) {
    // Detailed error logging for Stripe errors
    console.error('=== STRIPE CHECKOUT ERROR ===');
    console.error('Message:', err.message);
    if (err.type) console.error('Type:', err.type);
    if (err.code) console.error('Code:', err.code);
    if (err.statusCode) console.error('Status Code:', err.statusCode);
    if (err.raw) {
      console.error('Raw body:', JSON.stringify(err.raw, null, 2));
    }
    if (err.detail) console.error('Detail:', err.detail);
    if (err.payment_intent) console.error('Payment Intent:', err.payment_intent);
    console.error('Stack:', err.stack);
    console.error('=== END STRIPE ERROR ===');

    res.status(500).json({
      error: 'Failed to create checkout session',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

/**
 * Payment success page.
 */
router.get('/success', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.redirect('/product');
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      // Check if already processed
      const db = getDb();
      const existingOrder = db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get(session_id);

      if (existingOrder) {
        // Order already processed, show success with download info
        const downloadLink = db.prepare(`
          SELECT dl.* FROM download_links dl
          JOIN orders o ON dl.order_id = o.id
          WHERE o.stripe_session_id = ?
        `).get(session_id);

        return res.render('pages/payment-success', {
          title: 'Purchase Complete!',
          orderId: existingOrder.id,
          downloadToken: downloadLink ? downloadLink.token : null,
          currentPage: 'success',
          customerEmail: session.customer_details?.email || null
        });
      }

      // Process the completed order
      const customerId = generateId();
      const orderId = session.metadata?.order_id || generateId();
      const productId = session.metadata?.product_id || 'default-product';

      // Find or create customer
      let customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(session.customer_details?.email);
      
      if (!customer) {
        const stripeCustomerId = session.customer || null;
        db.prepare(`
          INSERT INTO customers (id, stripe_customer_id, email, name, phone)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          customerId,
          stripeCustomerId,
          session.customer_details?.email || 'unknown@example.com',
          session.customer_details?.name || null,
          session.customer_details?.phone || null
        );
        customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      }

      // Create order
      db.prepare(`
        INSERT INTO orders (id, customer_id, product_id, stripe_session_id, stripe_payment_intent_id, amount_cents, currency, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        orderId,
        customer.id,
        productId,
        session_id,
        session.payment_intent,
        session.amount_total || 2900,
        session.currency || 'usd'
      );

      // Create download link (7-day expiry, 5 download limit)
      const downloadLinkId = generateId();
      const token = generateToken();
      const expiresAt = getDownloadExpiry(7);

      db.prepare(`
        INSERT INTO download_links (id, order_id, customer_id, token, max_downloads, download_count, expires_at)
        VALUES (?, ?, ?, ?, 5, 0, ?)
      `).run(downloadLinkId, orderId, customer.id, token, expiresAt);

      const downloadLink = db.prepare('SELECT * FROM download_links WHERE id = ?').get(downloadLinkId);

      // Send purchase confirmation email (async, don't block)
      sendPurchaseConfirmation(customer, { id: orderId }, downloadLink).catch(err => {
        console.error('Purchase confirmation email failed:', err.message);
      });

      // Track analytics event
      db.prepare(`
        INSERT INTO analytics_events (id, event_type, customer_id, metadata)
        VALUES (?, 'purchase_completed', ?, ?)
      `).run(generateId(), customer.id, JSON.stringify({ order_id: orderId, amount: session.amount_total }));

      return res.render('pages/payment-success', {
        title: 'Purchase Complete!',
        orderId,
        downloadToken: token,
        currentPage: 'success',
        customerEmail: session.customer_details?.email || null
      });
    }

    res.render('pages/payment-success', {
      title: 'Payment Processing',
      orderId: null,
      downloadToken: null,
      currentPage: 'success',
      processing: true,
      customerEmail: session.customer_details?.email || null
    });
  } catch (err) {
    console.error('Payment success error:', err);
    res.render('pages/payment-success', {
      title: 'Payment Verification Error',
      orderId: null,
      downloadToken: null,
      currentPage: 'success',
      error: 'There was an issue verifying your payment. Please contact support with your session ID: ' + session_id,
      customerEmail: session.customer_details?.email || null
    });
  }
});

/**
 * Stripe webhook endpoint.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDb();

  switch (event.type) {
    case 'checkout.session.completed':
      // Already handled in success page, but this is the backup
      console.log('Webhook: checkout.session.completed', event.data.object.id);
      break;

    case 'charge.refunded':
      const charge = event.data.object;
      const paymentIntent = charge.payment_intent;
      
      // Update order refund status
      const order = db.prepare('SELECT * FROM orders WHERE stripe_payment_intent_id = ?').get(paymentIntent);
      if (order) {
        db.prepare(`
          UPDATE orders SET status = 'refunded', refund_status = 'refunded', refunded_at = datetime('now')
          WHERE id = ?
        `).run(order.id);

        // Deactivate download links for this order
        db.prepare(`
          UPDATE download_links SET is_revoked = 1 WHERE order_id = ?
        `).run(order.id);
      }
      break;

    case 'payment_intent.payment_failed':
      console.log('Webhook: payment failed', event.data.object.id);
      break;

    default:
      console.log(`Webhook: unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
