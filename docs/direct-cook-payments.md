# Direct cook payments pilot

Apply `20260920120000_direct_cook_payments` before deploying the updated backend/client. Run the normal Prisma migration deployment against the intended environment. This change does not migrate historic demo payments into real receipts.

## Cook setup

Account → Customer Payment Options lets a cook enable DuitNow QR, upload their JPEG/PNG QR and supply the recipient name. Pay on collection is independently optional. Settings are private to the backend; buyers see availability at checkout and the order's QR snapshot only after acceptance. An image upload and declared recipient name are not bank verification. Cooks must use a bank-permitted QR belonging to them; buyers must check the recipient shown by their bank.

## Checkout and fulfilment

- All new checkout requests must choose `cook_qr` or `pay_on_collection` and acknowledge the direct payment notice. Demo cards no longer produce new paid orders.
- Delivery permits only `cook_qr`. Collection permits either enabled option. No COD option is offered.
- Checkout reserves capacity and remains pending until the cook accepts. QR orders stay pending until the buyer reports a bank reference and the cook confirms actual receipt. The payment RPC updates all checkout dish lines in one transaction.
- QR is displayed for ten minutes after acceptance. It is hidden after expiry, but a buyer who already transferred money can still report it for reconciliation. The cook can reopen the payment window or cancel. **Unpaid reservations are not automatically discarded during the pilot**; cooks must cancel abandoned orders. A screenshot or buyer report never marks the payment paid.
- Pay on collection allows preparation after acceptance. Once every dish is ready, the cook records receipt, then verifies the existing pickup PIN. The PIN alone cannot complete an unpaid order.
- After confirming delivery payment, the cook requests a fresh Lalamove quote and explicitly accepts its price. The buyer's agreed total stays fixed. Quotes can expire while waiting for payment, so checkout itself never books a courier.
- Lalamove continues to charge the configured booking account. For direct receipts, its full fare is recorded against the cook in the existing delivery ledger because the buyer's money went directly to the cook. This is a record of the cook's obligation, **not an automatic debit of the cook's bank account**. Operators must arrange reimbursement/reconciliation for the pilot.

## Refunds and accounting

Direct transactions have zero Chefin processing fee, zero platform payout and `not_applicable` payout status. Bank/acquirer fees may still apply to the cook. A database trigger protects this invariant even when old hold/release or refund paths run.

The manual refund review queue remains. Approved direct refunds must be transferred by the cook. Admins record completion only after verifying receipt, with the transfer reference and audit note. The system cannot reverse a direct bank transfer. Cook/buyer order payment panels display refund decisions, and approval notifies the cook.

## Verification

`tests/directPaymentPolicy.test.ts` covers checkout eligibility. `tests/directPayments.integration.sql` creates a minimal fixture and applies the real migration in an **empty disposable PostgreSQL database only**. It verifies actor authorization, acceptance, bank-report versus cook confirmation, duplicate confirmation, all-line cancellation, payout protection and unpaid pickup completion guards.

Before production, test on devices with real cook QR images and the provider sandbox, including payment after timeout, quote expiry, courier booking failure and cook-issued refunds. No live payment-provider integration or automatic QR ownership verification is provided by this pilot.
