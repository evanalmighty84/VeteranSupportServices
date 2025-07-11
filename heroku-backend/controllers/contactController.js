require('dotenv').config();
const sendEmail = require('../utils/sendEmail');
const twilio = require('twilio');
const pool = require('../db/db');

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const businessPhone = '+12145489175';
const businessEmail = 'evan.ligon@clubhouselinks.com';
const userId = 8;

exports.createEmail = async (req, res) => {
  const {
    name,
    email,
    message = '',
    subject = '',
    smoker,
    dob
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  try {
    // Email content
    let htmlContent = `
      <h2>New Contact Message</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject || 'N/A'}</p>
    `;
    if (smoker) {
      htmlContent += `<p><strong>Smoker:</strong> ${smoker}</p>`;
    }
    if (dob) {
      htmlContent += `<p><strong>Date of Birth:</strong> ${dob}</p>`;
    }
    htmlContent += `<p><strong>Message:</strong><br>${message || 'N/A'}</p>`;

    const emailSubject = `📬 New Contact Submission from ${name}`;
    await sendEmail(businessEmail, emailSubject, htmlContent);

    // SMS to business
    let bizBody =
        `📬 New contact from ${name}\n` +
        `📧 ${email}\n` +
        `📝 Subject: ${subject}\n`;
    if (smoker) bizBody += `🚬 Smoker status: ${smoker}\n`;
    if (dob) bizBody += `🎂 DOB: ${dob}\n`;
    bizBody += `📩 ${message}`;

    await client.messages.create({
      body: bizBody,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SID,
      to: businessPhone
    });

    // Upsert by email only
    const existing = await pool.query(
        `SELECT id FROM subscribers WHERE user_id = $1 AND email = $2`,
        [userId, email]
    );

    if (existing.rows.length) {
      await pool.query(
          `UPDATE subscribers
         SET name = $1,
             email = $2,
             updated_at = NOW()
         WHERE id = $3`,
          [name, email, existing.rows[0].id]
      );
    } else {
      await pool.query(
          `INSERT INTO subscribers
         (user_id, name, email, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
          [userId, name, email]
      );
    }

    return res.status(200).json({ success: true, message: 'Contact form processed successfully.' });
  } catch (err) {
    console.error('❌ Error in createEmail:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

