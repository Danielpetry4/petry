/**
 * Email service using Nodemailer.
 * Sends transactional emails (purchase confirmation, download links, etc.).
 */
const nodemailer = require('nodemailer');
const { generateId } = require('./helpers');
const { getDb } = require('../config/database');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // In development, use a fake transporter that logs to console
  if (process.env.NODE_ENV === 'development' || !process.env.SMTP_HOST) {
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('=== Email (DEV MODE) ===');
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        console.log('Body:', mailOptions.html || mailOptions.text);
        console.log('========================');
        return { messageId: 'dev-' + generateId(), accepted: [mailOptions.to] };
      }
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendEmail({ to, subject, html, text, template }) {
  const emailId = generateId();
  const db = getDb();

  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@diycreditrepair.com',
      to,
      subject,
      html,
      text
    });

    db.prepare(`
      INSERT INTO email_logs (id, to_email, subject, template, status, sent_at)
      VALUES (?, ?, ?, ?, 'sent', datetime('now'))
    `).run(emailId, to, subject, template || null);

    return info;
  } catch (err) {
    db.prepare(`
      INSERT INTO email_logs (id, to_email, subject, template, status, error_message)
      VALUES (?, ?, ?, ?, 'failed', ?)
    `).run(emailId, to, subject, template || null, err.message);

    console.error('Email send failed:', err.message);
    throw err;
  }
}

/**
 * Send purchase confirmation with download link.
 */
async function sendPurchaseConfirmation(customer, order, downloadLink) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const downloadUrl = `${appUrl}/download/${downloadLink.token}`;
  const expiresDate = new Date(downloadLink.expires_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2c3e50;">Thank You for Your Purchase!</h1>
      <p>Hi ${customer.name || 'there'},</p>
      <p>Thank you for purchasing the <strong>DIY Credit Repair and Credit Building Guide</strong>.</p>
      <p>Your order has been confirmed. You can download your guide using the link below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}" style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
          Download Your Guide
        </a>
      </div>
      <p><strong>Download details:</strong></p>
      <ul>
        <li>Link expires: ${expiresDate}</li>
        <li>Maximum downloads: ${downloadLink.max_downloads}</li>
        <li>Order reference: ${order.id}</li>
      </ul>
      <p>If you have any questions, please visit our <a href="${appUrl}/support">Support page</a>.</p>
      <p style="color: #7f8c8d; font-size: 12px; margin-top: 40px;">
        This is an automated message from DIY Credit Repair Guide. Please do not reply directly.
      </p>
    </body>
    </html>
  `;

  return sendEmail({
    to: customer.email,
    subject: 'Your DIY Credit Repair Guide - Download Link',
    html,
    template: 'purchase-confirmation'
  });
}

/**
 * Send download link renewal email.
 */
async function sendDownloadLinkRenewal(customer, downloadLink) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const downloadUrl = `${appUrl}/download/${downloadLink.token}`;
  const expiresDate = new Date(downloadLink.expires_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2c3e50;">Your Download Link Has Been Renewed</h2>
      <p>Hi ${customer.name || 'there'},</p>
      <p>Your download link for the <strong>DIY Credit Repair and Credit Building Guide</strong> has been renewed.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}" style="background-color: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px;">
          Download Your Guide
        </a>
      </div>
      <ul>
        <li>New expiry: ${expiresDate}</li>
        <li>Maximum downloads: ${downloadLink.max_downloads}</li>
      </ul>
      <p style="color: #7f8c8d; font-size: 12px; margin-top: 40px;">This is an automated message from DIY Credit Repair Guide.</p>
    </body>
    </html>
  `;

  return sendEmail({
    to: customer.email,
    subject: 'Your Download Link Has Been Renewed',
    html,
    template: 'download-renewal'
  });
}

/**
 * Send support ticket confirmation.
 */
async function sendSupportConfirmation(name, email, ticketId) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2c3e50;">Support Ticket Received</h2>
      <p>Hi ${name || 'there'},</p>
      <p>We've received your support request. Here are your ticket details:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticketId}</li>
        <li><strong>Status:</strong> Open</li>
      </ul>
      <p>We'll get back to you as soon as possible.</p>
      <p style="color: #7f8c8d; font-size: 12px; margin-top: 40px;">This is an automated message from DIY Credit Repair Guide.</p>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Support Ticket #${ticketId} - Received`,
    html,
    template: 'support-confirmation'
  });
}

module.exports = {
  sendEmail,
  sendPurchaseConfirmation,
  sendDownloadLinkRenewal,
  sendSupportConfirmation
};