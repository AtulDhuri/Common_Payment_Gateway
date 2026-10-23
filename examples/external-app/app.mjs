// A minimal "merchant application" that takes payments through Payment Hub.
// It uses only API credentials and plain HTTP. There is no gateway code or SDK here.
//
//   PAYHUB_API_KEY=pk_... PAYHUB_API_SECRET=sk_... PAYHUB_WEBHOOK_SECRET=whsec_... node app.mjs
//
// One-time setup in the Payment Hub UI (Gateway page, "Checkout return URLs"):
//   Success URL and Failure URL = http://localhost:4000/return
//
// Webhooks (optional): on the Payment Hub Webhooks page set the URL to http://localhost:4000/payhub/webhook and copy the signing secret.
//
// Flow: customer clicks Pay -> this server creates the payment -> browser goes to Payment Hub checkout
//       -> customer pays -> Payment Hub sends the browser back to /return -> this server reads the real
//       status from the API and shows the order.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const HUB = (process.env.PAYHUB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.PAYHUB_API_KEY;
const API_SECRET = process.env.PAYHUB_API_SECRET;
const PORT = Number(process.env.PORT ?? 4000);
// Signing secret from Payment Hub's Webhooks page. Optional: without it the /payhub/webhook endpoint answers 503.
const WEBHOOK_SECRET = process.env.PAYHUB_WEBHOOK_SECRET;
const MAX_AGE_SECONDS = 300;

if (!API_KEY || !API_SECRET) {
  process.stderr.write('Set PAYHUB_API_KEY and PAYHUB_API_SECRET (create them on the API Credentials page).\n');
  process.exit(1);
}

// In a real app this is your database.
const orders = new Map(); // orderId -> paymentId
const byPayment = new Map(); // paymentId -> orderId
const seenDeliveries = new Set(); // delivery ids already processed (webhooks can arrive more than once)
const webhookStatus = new Map(); // paymentId -> last status announced by webhook

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Steps from docs/merchant-webhooks.md: raw body, constant-time signature check, reject old timestamps, ignore duplicates.
function verifyWebhook(headers, rawBody) {
  const ts = Number(headers['x-paymenthub-timestamp']);
  if (!Number.isInteger(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) return false;
  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(ts + '.' + rawBody).digest('hex');
  const given = String(headers['x-paymenthub-signature'] ?? '');
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

async function hub(method, path, body) {
  const res = await fetch(`${HUB}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'x-api-secret': API_SECRET },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${json.errorCode ?? res.status}: ${json.message}`);
  return json.data;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const page = (body, head = '') =>
  `<!doctype html><meta charset="utf-8"><title>Demo shop</title>${head}<body style="font-family:system-ui;max-width:480px;margin:3rem auto">${body}</body>`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, body, type = 'text/html; charset=utf-8', extra = {}) => {
    res.writeHead(status, { 'content-type': type, ...extra });
    res.end(body);
  };
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(
        200,
        page(`<h1>Demo shop</h1><p>Order: 1 meal, <b>₹1.00</b></p>
          <form method="post" action="/pay"><button style="padding:.6rem 1.2rem">Pay ₹1</button></form>`),
      );
    }

    // Payment Hub calls this when a payment changes state. Answer 2xx fast; do slow work after answering.
    if (req.method === 'POST' && url.pathname === '/payhub/webhook') {
      if (!WEBHOOK_SECRET) return send(503, 'webhook secret not configured', 'text/plain');
      const raw = await readBody(req);
      if (!verifyWebhook(req.headers, raw.toString('utf8'))) return send(401, 'invalid signature', 'text/plain');
      const deliveryId = String(req.headers['x-paymenthub-delivery-id'] ?? '');
      if (seenDeliveries.has(deliveryId)) return send(200, 'duplicate ignored', 'text/plain');
      seenDeliveries.add(deliveryId);
      const event = JSON.parse(raw.toString('utf8'));
      webhookStatus.set(event.paymentId, event.status);
      process.stdout.write(`webhook ${event.event} for ${event.paymentId} (${event.status})\n`);
      return send(200, 'ok', 'text/plain');
    }

    // Create the payment, remember it against our order, and send the browser to Payment Hub checkout.
    if (req.method === 'POST' && url.pathname === '/pay') {
      const orderId = `FOOD-${Date.now()}`;
      const payment = await hub('POST', '/payments/create', {
        amount: 1,
        currency: 'INR',
        customer: { name: 'Demo Customer', email: 'demo@example.com', phone: '9999999999' },
        metadata: { orderId },
      });
      orders.set(orderId, payment.paymentId);
      byPayment.set(payment.paymentId, orderId);
      return send(303, '', 'text/plain', { location: payment.checkoutUrl, 'x-order-id': orderId });
    }

    // Where Payment Hub sends the customer back (set as Success and Failure URL). The query string is
    // informational: we only use paymentId to find our order, and read the real status from the API.
    if (req.method === 'GET' && url.pathname === '/return') {
      const orderId = byPayment.get(url.searchParams.get('paymentId') ?? '');
      if (!orderId) return send(404, page('<p>Unknown payment.</p>'));
      return send(303, '', 'text/plain', { location: `/orders/${orderId}` });
    }

    const m = /^\/orders\/([\w-]+)(\.json)?$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const paymentId = orders.get(m[1]);
      if (!paymentId) return send(404, page('<p>Unknown order.</p>'));
      const p = await hub('GET', `/payments/${paymentId}`);
      if (m[2]) return send(200, JSON.stringify({ orderId: m[1], ...p }), 'application/json');
      const refresh = p.status === 'PENDING' ? '<meta http-equiv="refresh" content="3">' : '';
      return send(
        200,
        page(
          `<h1>Order ${esc(m[1])}</h1><p>Payment <code>${esc(p.paymentId)}</code></p>
           <p>Status: <b>${esc(p.status)}</b></p><p>Webhook said: ${esc(webhookStatus.get(p.paymentId) ?? 'nothing yet')}</p><p>Amount: ${esc(p.amount)} ${esc(p.currency)}</p>
           <p>Transaction: ${esc(p.transactionId ?? '-')}</p>${p.status === 'SUCCESS' ? '<p>Thank you! Your order is confirmed.</p>' : ''}
           <p><a href="/">Back to shop</a></p>`,
          refresh,
        ),
      );
    }

    send(404, page('<p>Not found.</p>'));
  } catch (err) {
    send(502, page(`<p>Payment error: ${esc(err.message)}</p>`));
  }
}).listen(PORT, () => process.stdout.write(`Demo shop on http://localhost:${PORT} (Payment Hub: ${HUB})\n`));
