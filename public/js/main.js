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
// AI Credit Assistant clean handler
document.addEventListener('DOMContentLoaded', function () {
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const chatSend = document.getElementById('chat-send');

  if (!chatForm || !chatInput || !chatMessages || !chatSend) {
    console.error('AI chat setup failed: missing chat form, input, messages, or send button.');
    return;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function appendMessage(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-chat-message ' + role;

    const avatar = document.createElement('div');
    avatar.className = 'ai-chat-avatar ' + role;
    avatar.textContent = role === 'user' ? 'You' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'ai-chat-bubble';
    bubble.innerHTML = escapeHtml(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendChatMessage(event) {
    event.preventDefault();

    const message = chatInput.value.trim();

    if (!message) {
      return;
    }

    appendMessage('user', message);
    chatInput.value = '';
    chatSend.disabled = true;
    chatSend.textContent = '...';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message
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
      chatSend.disabled = false;
      chatSend.textContent = 'Send';
    }
  }

  chatForm.addEventListener('submit', sendChatMessage);
});
