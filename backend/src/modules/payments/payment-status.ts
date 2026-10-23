// FILE: modules/payments/payment-status.ts
// PURPOSE: Payment statuses and the allowed transitions (docs/razorpay-integration.md)
// DEPENDENCIES: none
// PHASE: 5
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

const ALLOWED: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
  // The customer can retry inside the same Razorpay order, so a failure can still turn into a success.
  [PaymentStatus.FAILED]: [PaymentStatus.SUCCESS],
  // A payment can be captured after the customer closed the widget.
  [PaymentStatus.CANCELLED]: [PaymentStatus.SUCCESS],
  [PaymentStatus.SUCCESS]: [PaymentStatus.REFUNDED],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Event stored in payment_events for each applied status. PENDING is never a transition target. */
export const EVENT_FOR_STATUS: Partial<Record<PaymentStatus, string>> = {
  [PaymentStatus.SUCCESS]: 'PAYMENT_SUCCESS',
  [PaymentStatus.FAILED]: 'PAYMENT_FAILED',
  [PaymentStatus.CANCELLED]: 'PAYMENT_CANCELLED',
  [PaymentStatus.REFUNDED]: 'PAYMENT_REFUNDED',
};
