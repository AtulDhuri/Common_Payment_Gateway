# Phase 7 Report: Hosted Checkout

Spec: `docs/hosted-checkout.md`. Plan deliverables (`development-plan.md`): Checkout UI, Success Page, Failure Page.

## Completed features
| Feature | Where |
|---|---|
| Checkout page: merchant name, amount, payment reference, Pay button, opens the gateway window | `modules/checkout/checkout.page.ts` |
| Close-the-window handling: **Try again** / **Cancel payment** (closing no longer cancels the payment) | same |
| Success, Failed, Cancelled, Refunded and Processing result pages | same |
| Return to merchant: 3-second countdown and **Return to <merchant>** button, using the success/failure URL with `?paymentId=...&status=...` | same |
| No return URL configured: result page only ("You can close this page") | same |
| `GET/PUT /settings/redirects` (JWT), audit `REDIRECT_URLS_UPDATED` (field names only) | `modules/gateway-config/settings.*` |
| Gateway page section **Checkout return URLs**, with a one-click "Use the Payment Sandbox page for both" | `frontend/src/components/RedirectSettings.tsx` |
| Payment Sandbox: **Open Checkout** goes to checkout in the same tab and picks the payment up again from `?paymentId=` on return | `frontend/src/pages/PaymentSandbox.tsx` |
| Example shop: one Pay button, `/return` handler that reads the real status from the API | `examples/external-app/app.mjs` |
| Docs: `hosted-checkout.md`, `external-api-guide.md` (section 7), `payment-sandbox.md` | `docs/` |

The popup mode was built, then removed on request. Returning to the original page makes it unnecessary.

## Test results
- Backend: build and lint pass. **151 unit tests pass** (12 added: settings/DTO rules, checkout views, redirect rules, page safety).
- Frontend: type-check and build pass.
- **27 end-to-end checks passed in a real Edge browser** against the real app and Supabase database (final run, 0 failures). Razorpay's outbound calls were stubbed. Webhooks were signed with the real webhook logic.
- All test users were removed afterward. The real data (2 users, 4 payments, 1 API key) was untouched.

## Verified scenarios
1. Register, save gateway, set return URLs in the UI. They persist after a reload. A `javascript:` URL is rejected and nothing changes.
2. Example shop: Pay → same tab goes to checkout → signed gateway webhook → Success page (title, ₹1.00, reference, countdown, return button) → automatic redirect to the shop → shop shows SUCCESS from the API.
3. **Return to Food Co** button redirects at once.
4. Cancel: payment becomes CANCELLED, response carries the failure URL with `paymentId` and `status=CANCELLED`, and the Cancelled page renders.
5. **Sandbox**: Create payment → details show the new PENDING payment with Open Checkout enabled → same tab opens checkout (no new window) → webhook → success page → lands on `/sandbox` → payment auto-selected with **SUCCESS** and the gateway transaction id → history row SUCCESS → `?paymentId=` removed from the address bar.
6. With return URLs cleared, the result page shows "You can close this page" and no countdown.
7. Audit entries exist for the URL changes, with field names only.
8. Safety checks: the page contains no secret, no window messaging code, and renders server values with `textContent` only. HTML in names and URLs stays inert.

Screens are in `docs/phase-7-screens/` (success, cancelled, shop order, sandbox return).

## Not verified (known gaps)
1. **The live Razorpay widget on the new page.** The tests stubbed Razorpay and opened the page in its final state. They did not click through the real payment window. The code path *widget success → /complete → result page → redirect* shares the same result/return code as what was tested, but it has not run against a real Razorpay payment on this page. The earlier real payments used the older, simpler page.
2. **The Try again / Cancel payment buttons after closing the Razorpay window.** They need the real widget to be dismissed by a person. Their server side (`/cancel`) is tested.
3. A payment completed on a phone or in another browser tab still ends on the result page in that tab. Customers who close the browser never return, so merchants should still confirm by status API (and webhooks, Phase 8).

## Known issues and limits
- Return URLs are one pair per merchant, not per payment.
- `GET /settings/redirects` is not in the original `api-design.md`. It is documented in `hosted-checkout.md`.
- Return URLs accept `http` as well as `https` (needed for `localhost`). Require `https` in production.
- Row Level Security is still not enabled on Supabase `public` tables. Enable it with no policies on every table before real use.
- Stale processes: a backend started before this change keeps serving the old pages. Restart it (`npm run build`, `npm run start`).

## Manual check to close the gaps (about 3 minutes)
1. Restart the backend, then on the Gateway page click **Use the Payment Sandbox page for both** and **Save return URLs**.
2. In the Payment Sandbox create a ₹1 payment, click **Open Checkout**, and pay with an Indian test card (for example `5555 5100 0008 1006`).
3. Expected: the Success page, a 3-second countdown, then the sandbox with the payment selected and SUCCESS.
4. Repeat, but close the Razorpay window instead of paying. Expected: the page stays with **Try again** and **Cancel payment**. **Cancel payment** returns you to the sandbox with CANCELLED.

## Remaining work
- Phase 8: merchant webhooks (delivery, retries, signing).
- Dashboard enhancements (Phase 9): payment detail view, revenue summary.
- Enable Row Level Security on Supabase tables.
- Enforce https for return URLs in production.
- Real-payment verification of the new checkout page (manual check above).
