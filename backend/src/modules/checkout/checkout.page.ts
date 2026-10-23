// FILE: modules/checkout/checkout.page.ts
// PURPOSE: Renders the hosted checkout page: pay screen, success / failure / cancelled screens, redirect back to the merchant.
// Server data is passed as an inert JSON block and written with textContent, never concatenated into script code
// DEPENDENCIES: none
// PHASE: 5 (minimum), 7 (checkout UI, result pages, return to merchant)
export type CheckoutView =
  | {
      kind: 'pay';
      keyId: string;
      orderId: string;
      amountMinor: number;
      currency: string;
      businessName: string;
      reference: string;
      prefill: { name: string; email: string; contact: string };
    }
  | {
      kind: 'done';
      status: string;
      amount: number;
      currency: string;
      businessName: string;
      reference: string;
      /** Where the customer goes next (success/failure URL with paymentId and status), or null. */
      returnUrl: string | null;
    };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON that is safe inside <script type="application/json">: "<" can never close the tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.card{width:100%;max-width:420px;margin:1rem;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.10);overflow:hidden}
.head{display:flex;align-items:center;gap:.75rem;padding:1.1rem 1.5rem;border-bottom:1px solid #e2e8f0}
.logo{width:36px;height:36px;border-radius:10px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
.biz{font-weight:600}
.body{padding:1.75rem 1.5rem;text-align:center}
.amount{font-size:2.2rem;font-weight:700;margin:.25rem 0}
.ref{font-size:.78rem;color:#64748b;word-break:break-all}
.msg{margin:1.25rem 0 0;color:#334155;min-height:1.4em}
.icon{width:64px;height:64px;border-radius:50%;margin:0 auto 1rem;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff}
.ok{background:#16a34a}.bad{background:#dc2626}.neutral{background:#64748b}.wait{background:#d97706}
.title{font-size:1.25rem;font-weight:700;margin:0}
.btns{display:flex;flex-direction:column;gap:.6rem;margin-top:1.25rem}
button,a.btn{font:inherit;padding:.75rem 1rem;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;cursor:pointer;text-decoration:none;display:block}
button.primary{background:#4f46e5;border-color:#4f46e5;color:#fff;font-weight:600}
button:disabled{opacity:.5;cursor:not-allowed}
.foot{padding:.8rem 1.5rem;border-top:1px solid #e2e8f0;font-size:.75rem;color:#64748b;text-align:center}
[hidden]{display:none!important}
`;

/** Static HTML; every dynamic value is filled in by the script via textContent. */
const BODY = `
<div class="card">
  <div class="head"><div class="logo" id="logo"></div><div class="biz" id="biz"></div></div>
  <div class="body">
    <div id="view-pay">
      <div class="amount" id="amount-pay"></div>
      <div class="ref" id="ref-pay"></div>
      <p class="msg" id="msg" role="status"></p>
      <div class="btns">
        <button class="primary" id="btn-pay" type="button"></button>
        <button id="btn-cancel" type="button" hidden>Cancel payment</button>
      </div>
    </div>
    <div id="view-result" hidden>
      <div class="icon" id="icon"></div>
      <h1 class="title" id="title"></h1>
      <div class="amount" id="amount-result"></div>
      <div class="ref" id="ref-result"></div>
      <p class="msg" id="result-msg" role="status"></p>
      <div class="btns">
        <button class="primary" id="btn-return" type="button" hidden></button>
      </div>
    </div>
  </div>
  <div class="foot">Secured payment</div>
</div>`;

const SCRIPT = `
(function () {
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var token = new URLSearchParams(location.search).get('t') || '';
  var base = location.pathname;
  var $ = function (id) { return document.getElementById(id); };

  var RESULTS = {
    SUCCESS: { icon: '\\u2713', cls: 'ok', title: 'Payment successful', msg: 'Thank you. Your payment has been received.' },
    FAILED: { icon: '\\u2715', cls: 'bad', title: 'Payment failed', msg: 'The payment could not be completed. No money was taken.' },
    CANCELLED: { icon: '\\u2715', cls: 'neutral', title: 'Payment cancelled', msg: 'You cancelled this payment.' },
    REFUNDED: { icon: '\\u21A9', cls: 'neutral', title: 'Payment refunded', msg: 'This payment has been refunded.' },
    PENDING: { icon: '\\u2026', cls: 'wait', title: 'Payment processing', msg: 'We are waiting for the bank to confirm this payment.' }
  };

  function money(amount, currency) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency }).format(amount); }
    catch (e) { return currency + ' ' + amount; }
  }
  var amount = cfg.mode === 'pay' ? cfg.amountMinor / 100 : cfg.amount;
  $('biz').textContent = cfg.businessName;
  $('logo').textContent = (cfg.businessName || 'P').charAt(0).toUpperCase();
  ['pay', 'result'].forEach(function (s) {
    $('amount-' + s).textContent = money(amount, cfg.currency);
    $('ref-' + s).textContent = 'Ref: ' + cfg.reference;
  });

  function post(path, body) {
    return fetch(base + path + '?t=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  // Send the customer back to the merchant's page (their success/failure URL), after a short countdown.
  function leave(status, redirectUrl) {
    var out = $('result-msg');
    var base = RESULTS[status] ? RESULTS[status].msg : '';
    if (!redirectUrl) {
      out.textContent = (base ? base + ' ' : '') + 'You can close this page.';
      return;
    }
    var btn = $('btn-return');
    btn.textContent = 'Return to ' + cfg.businessName;
    btn.hidden = false;
    var left = 3, fired = false, timer;
    function fire() { if (fired) return; fired = true; clearInterval(timer); location.replace(redirectUrl); }
    function tick() { out.textContent = (base ? base + ' ' : '') + 'Returning in ' + left + 's...'; }
    btn.onclick = fire;
    tick();
    timer = setInterval(function () { left -= 1; if (left <= 0) fire(); else tick(); }, 1000);
  }

  function showResult(status, redirectUrl) {
    var r = RESULTS[status] || { icon: '?', cls: 'neutral', title: 'Payment ' + status, msg: '' };
    $('view-pay').hidden = true;
    $('view-result').hidden = false;
    $('icon').textContent = r.icon;
    $('icon').className = 'icon ' + r.cls;
    $('title').textContent = r.title;
    $('result-msg').textContent = r.msg;
    leave(status, redirectUrl);
  }

  if (cfg.mode === 'done') { showResult(cfg.status, cfg.returnUrl); return; }

  var btnPay = $('btn-pay'), btnCancel = $('btn-cancel'), msg = $('msg');
  var payLabel = 'Pay ' + money(amount, cfg.currency);
  btnPay.textContent = payLabel;

  function openWidget() {
    btnPay.disabled = true; btnCancel.hidden = true;
    msg.textContent = 'Opening secure payment window...';
    var rzp = new Razorpay({
      key: cfg.key, order_id: cfg.orderId, amount: cfg.amountMinor, currency: cfg.currency,
      name: cfg.businessName, prefill: cfg.prefill,
      handler: function (resp) {
        msg.textContent = 'Confirming your payment...';
        post('/complete', resp).then(function (res) {
          if (res && res.data) { showResult(res.data.status, res.data.redirectUrl); return; }
          msg.textContent = (res && res.message) || 'We could not confirm the payment.';
          btnPay.disabled = false;
        }).catch(function () {
          msg.textContent = 'Could not confirm the payment. If you were charged, the merchant will be notified.';
          btnPay.disabled = false;
        });
      },
      modal: { ondismiss: function () {
        // Closing the window is not a cancellation: let the customer retry or cancel on purpose.
        msg.textContent = 'Payment window closed. Your payment is not complete.';
        btnPay.textContent = 'Try again'; btnPay.disabled = false; btnCancel.hidden = false;
      } }
    });
    rzp.open();
  }
  btnPay.onclick = openWidget;
  btnCancel.onclick = function () {
    btnCancel.disabled = true;
    post('/cancel').then(function (res) {
      if (res && res.data) showResult(res.data.status, res.data.redirectUrl);
      else { msg.textContent = (res && res.message) || 'Could not cancel the payment.'; btnCancel.disabled = false; }
    }).catch(function () { msg.textContent = 'Could not cancel the payment.'; btnCancel.disabled = false; });
  };
  openWidget();
})();
`;

export function renderCheckoutPage(view: CheckoutView): string {
  const cfg =
    view.kind === 'pay'
      ? {
          mode: 'pay',
          key: view.keyId,
          orderId: view.orderId,
          amountMinor: view.amountMinor,
          currency: view.currency,
          businessName: view.businessName,
          reference: view.reference,
          prefill: view.prefill,
        }
      : {
          mode: 'done',
          status: view.status,
          amount: view.amount,
          currency: view.currency,
          businessName: view.businessName,
          reference: view.reference,
          returnUrl: view.returnUrl,
        };

  const razorpay = view.kind === 'pay' ? '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>\n' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(view.businessName)} - Payment</title><style>${STYLE}</style></head>
<body>${BODY}
<script id="cfg" type="application/json">${safeJson(cfg)}</script>
${razorpay}<script>${SCRIPT}</script></body></html>`;
}
