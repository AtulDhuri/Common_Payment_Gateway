# Hosted Checkout (Phase 7)

Deliverables from `development-plan.md`: Checkout UI, Success Page, Failure Page. Builds on the Phase 5 minimum (`/checkout/:reference`, `/complete`, `/cancel`).

## Customer experience
1. The merchant app sends the customer's browser to `checkoutUrl` (a normal redirect, same tab).
2. The page shows the merchant name, amount and payment reference, and opens the gateway payment window.
3. If the customer closes the payment window, the page stays open with **Try again** and **Cancel payment**. Closing the window no longer cancels the payment by itself.
4. After the gateway confirms, the page shows a Success page. Failed, cancelled and refunded payments show their own pages.
5. The customer goes back to the merchant:
   - A redirect URL is configured: the page redirects there after a 3 second countdown, with a **Return to <merchant>** button to go at once.
   - No redirect URL is configured: the page just shows the result.

There is no popup mode. The customer leaves the merchant's page for checkout and comes back to it.

## Redirect URLs
| Method | Path | Auth |
|---|---|---|
| GET | /settings/redirects | JWT |
| PUT | /settings/redirects | JWT. Replaces both values. `null` or empty clears one |

Body: `{ "successUrl": "https://shop.example/return", "failureUrl": "https://shop.example/return" }`. Only `http` and `https` URLs are accepted. After a payment ends the customer is sent to `successUrl` (SUCCESS) or `failureUrl` (FAILED, CANCELLED) with `?paymentId=pay_...&status=...` appended. It is informational. The merchant confirms with the status API or webhook.

`GET /settings/redirects` is not in `api-design.md`. It is added because the Gateway page must show the saved values.

Changes are written to the audit log as `REDIRECT_URLS_UPDATED` (field names only).

## Security
- The checkout page still needs the private `t` token. Wrong token and unknown payment look the same (404).
- The page receives only the public gateway key. No secret reaches the browser.
- All server data in the page is passed as inert JSON and written with `textContent`.
- `X-Frame-Options: DENY`: checkout cannot be embedded in an iframe.
- Headers: `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.

## Not included
Popup or embedded checkout, custom branding or themes, multiple languages, saved cards, per-payment return URLs.
