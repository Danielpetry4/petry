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

  // AI Chat functionality
  const chatForm = document.getElementById('chat-form');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatContainer = document.getElementById('chat-container');
  const chatBubbleBtn = document.getElementById('chat-bubble-btn');
  const chatCloseBtn = document.getElementById('chat-close-btn');

  // Toggle chat open/close
  if (chatBubbleBtn && chatContainer) {
    chatBubbleBtn.addEventListener('click', function () {
      chatContainer.classList.remove('closed');
      if (chatInput) chatInput.focus();
    });
  }

  if (chatCloseBtn && chatContainer) {
    chatCloseBtn.addEventListener('click', function () {
      chatContainer.classList.add('closed');
    });
  }

  if (chatForm && chatMessages && chatInput) {
    chatForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const message = chatInput.value.trim();
      if (!message) return;

      // Add user message to chat
      chatInput.value = '';
      appendChatMessage('user', message);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: message })
        });

        const data = await response.json();

        if (response.ok && data.message) {
          appendChatMessage('assistant', data.message);
        } else {
          appendChatMessage('assistant', 'Sorry, I could not answer that right now. Please try again.');
        }
      } catch (err) {
        console.error('Chat error:', err);
        appendChatMessage('assistant', 'Sorry, I could not answer that right now. Please try again.');
      }
    });
  }

  function appendChatMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'ai-chat-message';
    div.innerHTML = '<div class="ai-chat-avatar ' + role + '">' + (role === 'user' ? 'You' : 'AI') + '</div>' +
      '<div class="ai-chat-bubble">' + escapeHtml(text) + '</div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
