// controllers/contactController.js
require('dotenv').config();
const sendEmail = require('../utils/sendEmail');
const twilio    = require('twilio');
const pool      = require('../db/db');

// init Twilio client (make sure you have updated your env vars to TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const businessPhone = '+12145489175';
const businessEmail = 'evan.ligon@clubhouselinks.com';
const userId        = 8;

exports.createEmail = async (req, res) => {
  // now optionally accept smoker + dob
  const {
    name,
    email,
    message = '',
    phone,
    address = '',
    smoker,    // e.g. "Smoker" or "Non-Smoker"
    dob        // e.g. "1980-05-23"
  } = req.body;

  if (!name || !email || !phone) {
    return res
        .status(400)
        .json({ error: 'Name, email, and phone are required.' });
  }

  // sanitize phone
  let sanitizedPhone = phone.replace(/\D/g, '');
  if (sanitizedPhone.length === 10) {
    sanitizedPhone = '+1' + sanitizedPhone;
  } else if (!sanitizedPhone.startsWith('+')) {
    sanitizedPhone = '+' + sanitizedPhone;
  }

  try {
    // build email HTML
    let htmlContent = `
      <h2>New Contact Message</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${sanitizedPhone}</p>
      <p><strong>Address:</strong> ${address || 'N/A'}</p>
    `;
    if (smoker) {
      htmlContent += `<p><strong>Smoker:</strong> ${smoker}</p>`;
    }
    if (dob) {
      htmlContent += `<p><strong>Date of Birth:</strong> ${dob}</p>`;
    }
    htmlContent += `<p><strong>Message:</strong><br>${message || 'N/A'}</p>`;

    // send the email
    const subject = `📬 New Contact Submission from ${name}`;
    await sendEmail(businessEmail, subject, htmlContent);

    // text the customer
    await client.messages.create({
      body: `Hi ${name}, thanks for contacting Our Benefit Coach! We’ll reach out shortly.`,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SID,
      to: sanitizedPhone
    });

    // text the business, including optional fields
    let bizBody =
        `📬 New contact from ${name}\n` +
        `📞 ${sanitizedPhone}\n` +
        `📧 ${email}\n` +
        `🏠 ${address}\n`;
    if (smoker) bizBody += `🚬 Smoker status: ${smoker}\n`;
    if (dob)     bizBody += `🎂 DOB: ${dob}\n`;
    bizBody += `📩 ${message}`;

    await client.messages.create({
      body: bizBody,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SID,
      to: businessPhone
    });

    // upsert subscriber
    const existing = await pool.query(
        `SELECT id FROM subscribers
         WHERE user_id = $1 AND (email = $2 OR phone_number = $3)`,
        [userId, email, sanitizedPhone]
    );

    if (existing.rows.length) {
      await pool.query(
          `UPDATE subscribers
           SET name = $1,
               email = $2,
               phone_number = $3,
               physical_address = $4,
               updated_at = NOW()
         WHERE id = $5`,
          [name, email, sanitizedPhone, address, existing.rows[0].id]
      );
      console.log('🔄 Subscriber updated');
    } else {
      await pool.query(
          `INSERT INTO subscribers
           (user_id, name, email, phone_number, physical_address, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [userId, name, email, sanitizedPhone, address]
      );
      console.log('🆕 Subscriber inserted');
    }

    return res
        .status(200)
        .json({ success: true, message: 'Contact form processed successfully.' });

  } catch (err) {
    console.error('❌ Error in createEmail:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
