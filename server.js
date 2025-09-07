// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
const DONORS_FILE = path.join(__dirname, 'donors.json');

// Serve static frontend
app.use(express.static(PUBLIC_DIR));

// JSON parsing for endpoints (not for webhook)
app.use(express.json());

// Create a PaymentIntent for client-side Payment Element
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount = 5000, currency = (process.env.CURRENCY || 'aud'), metadata = {} } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // in cents
      currency,
      automatic_payment_methods: { enabled: true },
      metadata
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Return donors to frontend
app.get('/donors', (req, res) => {
  try {
    let donors = [];
    if (fs.existsSync(DONORS_FILE)) {
      donors = JSON.parse(fs.readFileSync(DONORS_FILE));
    }
    res.json(donors);
  } catch (err) {
    res.status(500).json({ error: 'Cannot read donors' });
  }
});

// Stripe webhook (must use raw body)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // set in .env
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // We'll handle both Checkout Session (payment links) and PaymentIntent succeeded
  const handleDonation = (name, amount) => {
    try {
      let donors = [];
      if (fs.existsSync(DONORS_FILE)) donors = JSON.parse(fs.readFileSync(DONORS_FILE));
      donors.unshift({ name: name || 'Anonymous', amount: amount || 0, time: new Date().toISOString() });
      // Keep last 200 donors to avoid file explosion
      donors = donors.slice(0, 200);
      fs.writeFileSync(DONORS_FILE, JSON.stringify(donors, null, 2));
    } catch (err) {
      console.error('Error saving donor', err);
    }
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const name = session.customer_details?.name || session.customer_email || 'Anonymous';
      const amount = session.amount_total ? session.amount_total / 100 : undefined;
      handleDonation(name, amount);
      break;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const charge = pi.charges && pi.charges.data && pi.charges.data[0];
      const name = charge?.billing_details?.name || charge?.billing_details?.email || 'Anonymous';
      const amount = (charge?.amount || pi.amount) / 100;
      handleDonation(name, amount);
      break;
    }
    default:
      // ignore other events
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
