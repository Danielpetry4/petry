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
// AI Credit Assistant chat
document.addEventListener('DOMContentLoaded', function () {
  const chatForm =
    document.querySelector('#chat-form') ||
    document.querySelector('.chat-form') ||
    document.querySelector('[data-chat-form]');

  const chatInput =
    document.querySelector('#chat-input') ||
    document.querySelector('#chat-message') ||
    document.querySelector('textarea[name="message"]') ||
    document.querySelector('.chat-widget textarea') ||
    document.querySelector('.credit-assistant textarea') ||
    document.querySelector('textarea');

  const chatMessages =
    document.querySelector('#chat-messages') ||
    document.querySelector('.chat-messages') ||
    document.querySelector('.credit-assistant-messages') ||
    document.querySelector('.chat-widget-messages') ||
    document.querySelector('.chat-messages-container');

  const sendButton =
    document.querySelector('#chat-send') ||
    document.querySelector('.chat-send') ||
    document.querySelector('.credit-assistant button[type="submit"]') ||
    document.querySelector('.chat-widget button[type="submit"]') ||
    document.querySelector('.credit-assistant button') ||
    document.querySelector('.chat-widget button');

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function appendMessage(role, text) {
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = role === 'user' ? 'chat-message user' : 'chat-message assistant';
    messageDiv.innerHTML = escapeHtml(text);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage(event) {
    if (event) event.preventDefault();

    if (!chatInput) return;

    const userTypedMessage = chatInput.value.trim();

    if (!userTypedMessage) return;

    appendMessage('user', userTypedMessage);
    chatInput.value = '';

    if (sendButton) {
      sendButton.disabled = true;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userTypedMessage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed');
      }

      appendMessage(
        'assistant',
        data.response || data.message || data.reply || 'Sorry, I could not answer that right now. Please try again.'
      );
    } catch (error) {
      console.error('AI chat error:', error);
      appendMessage('assistant', 'Sorry, I could not answer that right now. Please try again.');
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
      }
    }
  }

  if (chatForm) {
    chatForm.addEventListener('submit', sendChatMessage);
  } else if (sendButton) {
    sendButton.addEventListener('click', sendChatMessage);
  }
});
// AI Credit Assistant chat - stronger form submit fix
document.addEventListener('DOMContentLoaded', function () {
  const chatForm =
    document.querySelector('form[action="/api/chat"]') ||
    document.querySelector('form[action*="/api/chat"]') ||
    document.querySelector('#chat-form') ||
    document.querySelector('.chat-form') ||
    document.querySelector('[data-chat-form]') ||
    document.querySelector('.credit-assistant form') ||
    document.querySelector('.chat-widget form');

  const chatInput =
    document.querySelector('.credit-assistant input[type="text"]') ||
    document.querySelector('.chat-widget input[type="text"]') ||
    document.querySelector('.credit-assistant textarea') ||
    document.querySelector('.chat-widget textarea') ||
    document.querySelector('#chat-input') ||
    document.querySelector('#chat-message') ||
    document.querySelector('textarea[name="message"]') ||
    document.querySelector('input[name="message"]') ||
    document.querySelector('textarea') ||
    document.querySelector('input[type="text"]');

  const chatMessages =
    document.querySelector('.credit-assistant .messages') ||
    document.querySelector('.chat-widget .messages') ||
    document.querySelector('#chat-messages') ||
    document.querySelector('.chat-messages') ||
    document.querySelector('.credit-assistant-messages') ||
    document.querySelector('.chat-widget-messages') ||
    document.querySelector('.chat-messages-container');

  const sendButton =
    document.querySelector('.credit-assistant button[type="submit"]') ||
    document.querySelector('.chat-widget button[type="submit"]') ||
    document.querySelector('#chat-send') ||
    document.querySelector('.chat-send') ||
    document.querySelector('.credit-assistant button') ||
    document.querySelector('.chat-widget button');

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function appendMessage(role, text) {
    const container =
      chatMessages ||
      document.querySelector('.credit-assistant') ||
      document.querySelector('.chat-widget');

    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = role === 'user'
      ? 'chat-message user'
      : 'chat-message assistant';

    messageDiv.innerHTML = escapeHtml(text);
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  async function sendChatMessage(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!chatInput) {
      console.error('AI chat error: chat input not found');
      return false;
    }

    const userTypedMessage = chatInput.value.trim();

    if (!userTypedMessage) {
      return false;
    }

    appendMessage('user', userTypedMessage);
    chatInput.value = '';

    if (sendButton) {
      sendButton.disabled = true;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userTypedMessage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed');
      }

      appendMessage(
        'assistant',
        data.response ||
          data.message ||
          data.reply ||
          'Sorry, I could not answer that right now. Please try again.'
      );
    } catch (error) {
      console.error('AI chat error:', error);
      appendMessage(
        'assistant',
        'Sorry, I could not answer that right now. Please try again.'
      );
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
      }
    }

    return false;
  }

  if (chatForm) {
    chatForm.addEventListener('submit', sendChatMessage);
    chatForm.onsubmit = sendChatMessage;
  }

  if (sendButton) {
    sendButton.addEventListener('click', sendChatMessage);
  }

  document.addEventListener(
    'submit',
    function (event) {
      const form = event.target;

      if (form && form.action && form.action.includes('/api/chat')) {
        sendChatMessage(event);
      }
    },
    true
  );
});
