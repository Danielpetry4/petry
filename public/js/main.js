/**
 * Client-side JavaScript for DIY Credit Repair Guide
 */

document.addEventListener('DOMContentLoaded', function () {
  // Mobile navigation toggle
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileToggle) {
    mobileToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
    });
  }

  // Stripe checkout integration
  const checkoutBtn = document.getElementById('checkout-button');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      
      const button = this;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Processing...';

      try {
        const response = await fetch('/payment/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerEmail: ''
          })
        });

        const data = await response.json();

        if (data.sessionUrl) {
          window.location.href = data.sessionUrl;
        } else {
          console.error('Checkout error:', data.error);
          alert('Unable to start checkout. Please try again.');
          button.disabled = false;
          button.textContent = originalText;
        }
      } catch (err) {
        console.error('Checkout error:', err);
        alert('Unable to start checkout. Please try again.');
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }

  // Analytics tracking
  function trackEvent(eventType, metadata) {
    try {
      const payload = {
        eventType: eventType,
        pageUrl: window.location.pathname,
        sessionId: getSessionId(),
        metadata: metadata || {}
      };

      // Use sendBeacon for reliability on page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/analytics/track', blob);
      } else {
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {
      // Silent fail for analytics
    }
  }

  // Session ID generation and storage
  function getSessionId() {
    let sessionId = localStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = generateUUID();
      localStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Track page view
  trackEvent('page_view');

  // Track product view if on product page
  if (window.location.pathname === '/product') {
    trackEvent('product_view');
  }

  // Track FAQ view
  if (window.location.pathname === '/faq') {
    trackEvent('faq_view');
  }

  // Track support view
  if (window.location.pathname === '/support') {
    trackEvent('support_view');
  }

  // Track legal page views
  const legalPages = ['/privacy', '/terms', '/refund-policy'];
  if (legalPages.includes(window.location.pathname)) {
    trackEvent('legal_view');
  }
});