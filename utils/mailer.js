// backend/utils/mailer.js
const nodemailer = require('nodemailer');

function makeTransport() {
  // 1) SendGrid (Single Sender or Domain Auth)
  if (process.env.SENDGRID_API_KEY) {
    const t = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false, // STARTTLS
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
    return t;
  }

  // 2) Gmail (App Password)
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const port = Number(process.env.EMAIL_PORT || 587);
    const secure =
      port === 465 ||
      String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true';
    const t = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // e.g., smtp.gmail.com
      port,
      secure,                       // true only if 465
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    return t;
  }

  // 3) Generic/Legacy SMTP (e.g., Mailtrap Sandbox)
  if (process.env.SMTP_HOST) {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    return t;
  }

  // 4) Dev fallback: log email to console
  return {
    verify: async () => {
      console.warn('[MAIL] No SMTP configured. Using DEV console transport.');
    },
    sendMail: async ({ to, subject, text, html, from, replyTo }) => {
      const defaultFrom =
        process.env.EMAIL_FROM ||
        process.env.SMTP_FROM ||
        '"AeroJob" <no-reply@aerojob.app>';
      console.log('✉️ [DEV MAIL] to:', to, '| subject:', subject);
      if (replyTo) console.log('replyTo:', replyTo);
      if (text) console.log('text:', text);
      if (html) console.log('html:', html);
      return { accepted: [to], envelope: { from: from || defaultFrom, to: [to] } };
    },
  };
}

const transporter = makeTransport();

async function sendMail({ to, subject, html, text, from, replyTo }) {
  // Prefer EMAIL_FROM; for Gmail, it should match EMAIL_USER to avoid rejections.
  const defaultFrom =
    process.env.EMAIL_FROM ||
    (process.env.EMAIL_USER ? `"AeroJob" <${process.env.EMAIL_USER}>` : null) ||
    process.env.SMTP_FROM ||
    '"AeroJob" <no-reply@aerojob.app>';

  return transporter.sendMail({
    from: from || defaultFrom,
    to,
    subject,
    html,
    text,
    replyTo,
  });
}

// Verify on boot so misconfig shows up immediately
transporter
  .verify()
  .then(() => console.log('[MAIL] SMTP ready'))
  .catch((err) =>
    console.error('[MAIL] SMTP verify failed:', err?.response || err?.message || err)
  );

module.exports = { sendMail, transporter };
