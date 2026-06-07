/**
 * AI Chat API endpoint with compliance filtering.
 * Provides AI-powered credit education responses with built-in compliance guardrails.
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const { generateId } = require('../utils/helpers');

/**
 * Compliance keywords and patterns that should be flagged.
 * These indicate the user may be seeking advice that crosses into
 * territory that should not be handled by an automated system.
 */
const COMPLIANCE_FLAGS = [
  { pattern: /social security/i, type: 'pii_mention', severity: 'high' },
  { pattern: /\bssn\b/i, type: 'pii_mention', severity: 'high' },
  { pattern: /(\d{3}[-]\d{2}[-]\d{4})/, type: 'pii_exposure', severity: 'critical' },
  { pattern: /fake|fraud|scam/i, type: 'fraud_concern', severity: 'high' },
  { pattern: /illegal/i, type: 'illegal_activity', severity: 'high' },
  { pattern: /hack/i, type: 'hacking_mention', severity: 'high' },
  { pattern: /sue|lawsuit|attorney|lawyer/i, type: 'legal_referral', severity: 'medium' },
  { pattern: /bankrupt|cannot pay|won\'?t pay/i, type: 'financial_distress', severity: 'medium' },
  { pattern: /suicide|kill|hurt/i, type: 'crisis', severity: 'critical' },
  { pattern: /guaranteed|promise|100[%]|sure thing/i, type: 'promise_seeking', severity: 'medium' },
  { pattern: /medical debt/i, type: 'medical_debt', severity: 'low' },
  { pattern: /identity theft/i, type: 'identity_theft', severity: 'high' },
];

/**
 * Restricted topics where the AI should not give specific advice.
 */
const RESTRICTED_TOPICS = [
  'dispute a charge', 'sue', 'file a lawsuit', 'bankruptcy',
  'consolidate debt', 'debt settlement', 'negotiate with collectors',
  'pay for delete', 'fake identity', 'create fake', 'fraudulent'
];

/**
 * AI response templates for common credit topics.
 */
const AI_RESPONSES = {
  'greeting': [
    "Welcome! I'm here to help you understand credit reports, scores, and how to build better credit habits. What would you like to learn about today?",
    "Hi there! I can help explain credit reporting concepts and guide you toward educational resources. What's on your mind?"
  ],
  'credit_report': [
    "Your credit report contains information about your credit history, including accounts, payment history, and public records. You can request a free copy from each bureau (Equifax, Experian, TransUnion) annually at AnnualCreditReport.com. Our guide goes into detail on how to review each section.",
    "Credit reports are maintained by three major bureaus. Reviewing your reports regularly is an important habit. Our guide provides a step-by-step checklist for reviewing each section of your report for accuracy."
  ],
  'credit_score': [
    "Credit scores range from 300-850 and are calculated based on your credit report data. Key factors include payment history (35%), credit utilization (30%), length of credit history (15%), new credit (10%), and credit mix (10%). Our guide explains each factor in detail with actionable tips.",
    "Building good credit takes time and consistent habits. Key factors are paying on time, keeping balances low, and maintaining older accounts. Our guide has a full chapter on credit-building strategies."
  ],
  'dispute': [
    "If you find information on your credit report that you believe is inaccurate, you can file a dispute with the credit bureau. The bureau must investigate within 30 days. Our guide includes sample dispute letters and a step-by-step dispute process.",
    "Disputing errors on your credit report is your right under the Fair Credit Reporting Act. Our guide provides a complete walkthrough of the dispute process for each bureau."
  ],
  'fraud': [
    "If you suspect fraud or identity theft, visit IdentityTheft.gov from the FTC to report it and create a recovery plan. You can also place a fraud alert on your credit reports. Our guide covers the complete identity theft recovery process.",
    "For fraud situations, acting quickly is important. Place a fraud alert on your credit reports and review them carefully. Our guide provides a detailed action plan for handling fraud."
  ],
  'default': [
    "That's a great question! Our DIY Credit Report & Credit Building Guide covers this topic and many others in detail. The guide provides practical, step-by-step instructions for understanding and managing your credit. You can purchase it from our product page.",
    "I'd be happy to help you understand this topic better. Our educational guide provides comprehensive information on credit management, reporting, and building healthy financial habits."
  ]
};

/**
 * Simple intent detection from user message.
 */
function detectIntent(message) {
  const lower = message.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey')) return 'greeting';
  if (lower.includes('credit report') || lower.includes('credit bureau') || lower.includes('equifax') || lower.includes('experian') || lower.includes('transunion')) return 'credit_report';
  if (lower.includes('credit score') || lower.includes('fico') || lower.includes('vantagescore')) return 'credit_score';
  if (lower.includes('dispute') || lower.includes('error') || lower.includes('incorrect') || lower.includes('mistake') || lower.includes('inaccurate')) return 'dispute';
  if (lower.includes('fraud') || lower.includes('identity theft') || lower.includes('stolen')) return 'fraud';
  return 'default';
}

/**
 * Check message for compliance issues.
 */
function checkCompliance(message) {
  const flags = [];
  
  for (const rule of COMPLIANCE_FLAGS) {
    if (rule.pattern.test(message)) {
      flags.push({
        type: rule.type,
        severity: rule.severity,
        reason: `Matched compliance rule: ${rule.type}`
      });
    }
  }

  // Check for restricted topics
  const lower = message.toLowerCase();
  for (const topic of RESTRICTED_TOPICS) {
    if (lower.includes(topic)) {
      flags.push({
        type: 'restricted_topic',
        severity: 'high',
        reason: `User asked about restricted topic: "${topic}"`
      });
    }
  }

  return flags;
}

/**
 * Generate compliance-restricted response.
 */
function getRestrictedResponse() {
  return "I'm not able to provide specific advice on that topic. If you need legal assistance, please consult with a qualified attorney or financial professional. For general credit education, our guide provides helpful information about understanding and managing your credit.";
}

/**
 * POST /api/chat - Send a message to the AI chat.
 */
router.post('/chat', (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  const db = getDb();
  const chatSessionId = sessionId || generateId();

  // Log the user message
  const userLogId = generateId();
  db.prepare(`
    INSERT INTO ai_chat_logs (id, session_id, role, message)
    VALUES (?, ?, 'user', ?)
  `).run(userLogId, chatSessionId, message.trim());

  // Check compliance
  const complianceFlags = checkCompliance(message);
  let responseText;

  if (complianceFlags.length > 0) {
    // Check for critical severity - must use restricted response
    const criticalFlags = complianceFlags.filter(f => f.severity === 'critical');
    if (criticalFlags.length > 0) {
      responseText = getRestrictedResponse();
    } else {
      // For high/medium/low, use restricted response for restricted topics
      const hasRestricted = complianceFlags.some(f => f.type === 'restricted_topic');
      responseText = hasRestricted
        ? getRestrictedResponse()
        : getAIResponse(message);
    }

    // Log compliance flags
    for (const flag of complianceFlags) {
      const flagId = generateId();
      db.prepare(`
        INSERT INTO compliance_flags (id, ai_chat_log_id, session_id, flag_type, severity, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(flagId, userLogId, chatSessionId, flag.type, flag.severity, flag.reason);
    }
  } else {
    responseText = getAIResponse(message);
  }

  // Log assistant response
  const assistantLogId = generateId();
  db.prepare(`
    INSERT INTO ai_chat_logs (id, session_id, role, message)
    VALUES (?, ?, 'assistant', ?)
  `).run(assistantLogId, chatSessionId, responseText);

  res.json({
    message: responseText,
    sessionId: chatSessionId,
    complianceFlags: complianceFlags.length > 0 ? complianceFlags.map(f => f.type) : undefined
  });
});

/**
 * Get a contextual AI response based on intent detection.
 */
function getAIResponse(message) {
  const intent = detectIntent(message);
  const responses = AI_RESPONSES[intent] || AI_RESPONSES['default'];
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * GET /api/chat/history/:sessionId - Retrieve chat history (for admin use).
 */
router.get('/chat/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const db = getDb();
  
  const messages = db.prepare(`
    SELECT role, message, created_at FROM ai_chat_logs
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId);

  res.json({ sessionId, messages });
});

module.exports = router;