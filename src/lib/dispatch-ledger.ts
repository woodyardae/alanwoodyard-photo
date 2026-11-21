/**
 * In-process record of supplier dispatches that already succeeded.
 * A repeated checkout.session.completed delivery must not create a second lab order.
 * Notification failures do not remove a saved receipt.
 */

import type { OrderRoutingResult } from './fulfillment';
import type { DispatchNotice } from './notifications';

export interface DispatchReceipt {
  sessionId: string;
  notice: DispatchNotice;
  fulfillment: OrderRoutingResult;
  notified: boolean;
}

const receipts = new Map<string, DispatchReceipt>();

export function readDispatchReceipt(sessionId: string): DispatchReceipt | null {
  return receipts.get(sessionId) ?? null;
}

export function saveDispatchReceipt(receipt: DispatchReceipt): void {
  receipts.set(receipt.sessionId, receipt);
}

export function clearDispatchReceipts(): void {
  receipts.clear();
}
