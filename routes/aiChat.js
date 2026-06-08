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
 * Each entry is an array of response variations.
 */
const AI_RESPONSES = {
  'greeting': [
    "Welcome! I'm here to help you understand credit reports, scores, and how to build better credit habits. What would you like to learn about today? You can ask about credit freezes, disputes, credit scores, fraud alerts, and more.",
    "Hi there! I can help explain credit reporting concepts and guide you toward educational resources. Try asking me about credit freezes, how disputes work, or how to read a credit report."
  ],
  'credit_report': [
    "Your credit report contains information about your credit history, including accounts, payment history, and public records. You can request a free copy from each bureau (Equifax, Experian, TransUnion) annually at AnnualCreditReport.com. During the COVID-19 pandemic, free weekly online reports were made available through April 2022. Check the CFPB website for current availability.\n\nWhen reviewing your report, look for: accounts you don't recognize, incorrect personal information, wrong payment statuses, and duplicate entries. Our guide provides a step-by-step checklist for reviewing each section of your report for accuracy.",
    "Credit reports are maintained by three major bureaus: Equifax, Experian, and TransUnion. Each bureau may have slightly different information because not all creditors report to all three. Reviewing all three reports is recommended.\n\nBy federal law, you are entitled to one free report from each bureau every 12 months through AnnualCreditReport.com — the only government-authorized source. Our guide explains how to request them and what to look for in each section."
  ],
  'credit_score': [
    "Credit scores range from 300 to 850 and are calculated based on information in your credit report. The most common scoring models are FICO and VantageScore. Key factors for FICO scores are: payment history (35%), credit utilization (30%), length of credit history (15%), new credit (10%), and credit mix (10%).\n\nLate payments can stay on your report for up to 7 years. Chapter 7 bankruptcy can remain for 10 years. Our guide explains each factor in detail with practical strategies for building credit over time.",
    "Building good credit takes consistent habits. Key strategies include: paying all bills on time every month, keeping credit card balances low (under 30% of your credit limit), avoiding opening too many new accounts at once, and maintaining older accounts to build credit history length.\n\nThere is no quick fix for credit scores. Score improvements happen gradually as you demonstrate responsible credit use over time. Our guide has a full chapter on credit-building strategies with actionable steps."
  ],
  'dispute': [
    "If you find information on your credit report that you believe is inaccurate, you have the right to dispute it under the Fair Credit Reporting Act (FCRA). To start a dispute, contact the credit bureau that reported the information — you can do this online, by mail, or by phone.\n\nThe bureau must investigate your dispute within 30 days (with a possible 15-day extension). They will contact the creditor who provided the information. If the creditor cannot verify the information, it must be removed or corrected.\n\nOur guide includes sample dispute letters and a complete step-by-step walkthrough of the dispute process for each bureau, including what documentation to gather and how to track your dispute.",
    "Disputing errors on your credit report is your right under the Fair Credit Reporting Act. The three credit bureaus (Equifax, Experian, TransUnion) each have their own online dispute portals, but many consumers find that mailing dispute letters with tracking provides a clearer paper trail.\n\nWhen disputing, be specific about what information is inaccurate and why. Include any supporting documents, such as payment records or identity documents. Keep copies of everything you send.\n\nAccurate negative information generally cannot be removed simply because it is negative. Our guide provides a complete walkthrough of the dispute process for each bureau."
  ],
  'fraud': [
    "If you suspect fraud or identity theft, visit IdentityTheft.gov from the Federal Trade Commission (FTC) to report it and create a personalized recovery plan. The FTC will provide step-by-step instructions based on your specific situation.\n\nYou should also place a fraud alert on your credit reports. A fraud alert tells lenders to take extra steps to verify your identity before opening new accounts. It is free and lasts for one year (or seven years if you have an identity theft report). You only need to contact one bureau — they will notify the other two.\n\nOur guide covers the complete identity theft recovery process with checklists and sample letters.",
    "For fraud situations, acting quickly is important. First, contact one of the three credit bureaus to place a fraud alert on your credit reports. The bureau you contact will notify the other two.\n\nNext, review your credit reports carefully for accounts or inquiries you don't recognize. If you find fraudulent accounts, contact the creditor directly and file a dispute with the credit bureau.\n\nFor more serious identity theft cases, you can also place a credit freeze (see our information on credit freezes) and file a report with your local police department. Our guide provides a detailed action plan for handling fraud."
  ],
  'credit_freeze': [
    "A credit freeze (also called a security freeze) restricts access to your credit report, making it difficult for identity thieves to open new accounts in your name. When a freeze is in place, lenders generally cannot view your credit report unless you temporarily lift or permanently remove the freeze.\n\nKey facts about credit freezes:\n- Freezes are free to place and lift at all three bureaus (Equifax, Experian, TransUnion).\n- A freeze does not hurt your credit score.\n- A freeze stays in place until you remove it — there is no expiration date.\n- You must lift or temporarily \"thaw\" the freeze before applying for credit, a loan, or a new job that requires a credit check.\n- You can lift a freeze for a specific time period or for a specific creditor.\n\nTo place a freeze, contact each bureau individually. You will need to provide identifying information and may receive a PIN or password to manage the freeze later. Our guide provides step-by-step instructions for placing and managing freezes at all three bureaus."
  ],
  'fraud_alert': [
    "A fraud alert is a notice placed on your credit report that asks lenders to take extra steps to verify your identity before opening new accounts. Unlike a credit freeze, a fraud alert does not block access to your credit report — it simply requires additional verification.\n\nThere are three types of fraud alerts:\n1. Initial fraud alert — lasts 1 year, for those who suspect they may be a victim of fraud.\n2. Extended fraud alert — lasts 7 years, for confirmed identity theft victims who provide an identity theft report.\n3. Active duty alert — lasts 1 year, for active-duty military personnel.\n\nFraud alerts are free to place. You only need to contact one credit bureau — they will notify the other two. Our guide explains the difference between fraud alerts and credit freezes and when to use each one."
  ],
  'credit_utilization': [
    "Credit utilization is the ratio of your credit card balances to your credit card limits. It is the second most important factor in your FICO score, accounting for 30% of your score.\n\nA lower utilization rate is generally better. Many experts recommend keeping your utilization under 30% of your available credit. For example, if you have a $1,000 credit limit, try to keep your balance below $300.\n\nYou can improve your utilization by paying down balances, requesting a credit limit increase (without increasing spending), or spreading purchases across multiple cards. Utilization has no memory in most scoring models — as soon as you pay down your balance, your score typically improves the next month."
  ],
  'collections': [
    "A collection account appears on your credit report when an unpaid debt has been transferred to a third-party collection agency. The original creditor may have sold the debt or hired the agency to collect on their behalf.\n\nCollection accounts can significantly lower your credit score and remain on your report for up to 7 years from the original delinquency date — not from when the collection agency received it.\n\nIf a collection account is inaccurate, you can dispute it with the credit bureau. If it is accurate, paying it may update the status to \"paid\" but the account can remain on your report. Some scoring models ignore paid collections, but policies vary. Our guide explains your options and how collection accounts affect your credit."
  ],
  'secured_card': [
    "A secured credit card is a type of credit card that requires a security deposit, which typically becomes your credit limit. For example, a $500 deposit gives you a $500 credit limit. Secured cards are designed for people who are building credit from scratch or rebuilding after credit difficulties.\n\nMost secured cards report your payment activity to the credit bureaus, so on-time payments can help build positive credit history. After several months of responsible use, many issuers will convert your card to an unsecured card and return your deposit.\n\nWhen choosing a secured card, look for one that reports to all three credit bureaus, has low fees, and offers a path to upgrading to an unsecured card. Our guide provides tips for selecting and using secured cards effectively."
  ],
  'credit_inquiries': [
    "A credit inquiry (also called a \"hard pull\" or \"hard inquiry\") occurs when a lender checks your credit report as part of a credit application. Hard inquiries can lower your credit score by a few points and remain on your report for two years. However, they only affect your FICO score for the first 12 months.\n\nMultiple inquiries for the same type of credit (such as mortgage, auto loan, or student loan) within a short period (typically 14–45 days) are usually counted as a single inquiry by scoring models. This allows you to rate-shop without hurting your score multiple times.\n\nChecking your own credit report through AnnualCreditReport.com or a credit monitoring service does not hurt your score — those are \"soft inquiries\" and are not visible to lenders."
  ],
  'debt_validation': [
    "Debt validation is your right under the Fair Debt Collection Practices Act (FDCPA) to request that a debt collector prove you owe the debt. You must send a written debt validation request within 30 days of the collector's first contact with you.\n\nThe collector must then provide proof of the debt, including: the amount owed, the original creditor's name, and documentation showing you agreed to pay. If they cannot validate the debt, they must stop collection efforts and can be reported to the CFPB.\n\nOur guide includes a sample debt validation letter and explains step-by-step how to handle debt collection communications.",
    "Under the Fair Debt Collection Practices Act, when a debt collector first contacts you, they must send you a written notice within five days. You then have 30 days to send a debt validation request asking them to prove the debt is yours and that they have the right to collect it.\n\nIf you request validation, the collector must stop all collection activities until they provide proof. If they cannot verify the debt, they may be required to stop collection permanently.\n\nOur guide includes a sample debt validation letter template and walks through the full process, including how to respond if the collector verifies the debt."
  ],
  'collections_removal': [
    "If a collection account on your credit report is inaccurate or belongs to someone else, you can dispute it with the credit bureau. The bureau must investigate within 30 days. If the collection agency cannot verify the debt, the account must be removed.\n\nIf the collection account is accurate, it will generally remain on your report for 7 years from the original delinquency date. Paying the collection may update the status to \"paid\" but does not automatically remove it. Some newer scoring models (like FICO 9 and VantageScore 4.0) ignore paid collections, but older models still include them.\n\nOur guide explains your options for handling collection accounts, including pay-for-delete policies (where permitted), goodwill letters, and how to negotiate with collection agencies."
  ],
  'default': [
    "That's a great question! Our DIY Credit Report & Credit Building Guide covers this topic and many others in detail. The guide provides practical, step-by-step instructions for understanding and managing your credit. You can learn more on our product page.\n\nIf you'd like to ask about a specific topic, try: credit freezes, fraud alerts, how to read a credit report, how credit scores work, disputing errors, debt validation, credit utilization, secured cards, or collection accounts.",
    "I'd be happy to help you understand this topic better. Our educational guide provides comprehensive information on credit management, reporting, and building healthy financial habits. You can find more details on our product page.\n\nIn the meantime, feel free to ask about specific credit topics like credit freezes, fraud alerts, credit scores, disputes, or credit building strategies."
  ]
};

/**
 * Simple intent detection from user message.
 */
function detectIntent(message) {
  const lower = message.toLowerCase();
  if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good evening')) return 'greeting';
  if (lower.includes('credit report') || lower.includes('credit bureau') || lower.includes('equifax') || lower.includes('experian') || lower.includes('transunion') || lower.includes('annualcreditreport')) return 'credit_report';
  if (lower.includes('credit score') || lower.includes('fico') || lower.includes('vantagescore') || lower.includes('score range')) return 'credit_score';
  if (lower.includes('dispute') || lower.includes('error') || lower.includes('incorrect') || lower.includes('mistake') || lower.includes('inaccurate')) return 'dispute';
  if (lower.includes('fraud') || lower.includes('identity theft') || lower.includes('stolen') || lower.includes('identitytheft')) return 'fraud';
  if (lower.includes('credit freeze') || lower.includes('security freeze') || lower.includes('freeze your') || lower.includes('place a freeze')) return 'credit_freeze';
  if (lower.includes('fraud alert')) return 'fraud_alert';
  if (lower.includes('utilization') || lower.includes('credit card balance') || lower.includes('balance to limit') || lower.includes('credit limit') && lower.includes('percentage')) return 'credit_utilization';
  if (lower.includes('collection') || lower.includes('collections') || lower.includes('collection agency') || lower.includes('debt collector')) {
    if (lower.includes('remove') || lower.includes('delete') || lower.includes('pay for delete')) return 'collections_removal';
    return 'collections';
  }
  if (lower.includes('secured card') || lower.includes('secured credit card') || lower.includes('deposit card')) return 'secured_card';
  if (lower.includes('inquiry') || lower.includes('hard pull') || lower.includes('hard inquiry') || lower.includes('credit check')) return 'credit_inquiries';
  if (lower.includes('debt validation') || lower.includes('validate') || lower.includes('validation letter') || lower.includes('fdcpa')) return 'debt_validation';
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
