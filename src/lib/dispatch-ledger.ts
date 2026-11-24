/**
 * Durable record of supplier dispatches that already succeeded.
 * A repeated checkout.session.completed or checkout.session.async_payment_succeeded
 * delivery must not create a second lab order, and a mixed-lab order that partially
 * succeeds must only retry the labs that failed.
 *
 * Session-level receipts (webhook_receipt:{sessionId}) and per-lab parcel receipts
 * (webhook_parcel:{sessionId}:{lab}) persist in Cloudflare KV (env.SESSION) when it
 * is available, with an in-memory map as a fallback and warm cache. Notification
 * failures do not remove a saved receipt. KV write failures fall back to the
 * in-memory record so a single request still dedupes correctly.
 */

import type { DispatchedParcelResult, OrderRoutingResult, PodLab } from './fulfillment';
import type { DispatchNotice } from './notifications';

/** Minimal Cloudflare KV surface this module depends on. */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface DispatchReceipt {
  sessionId: string;
  notice: DispatchNotice;
  fulfillment: OrderRoutingResult;
  notified: boolean;
}

export interface ParcelReceipt {
  sessionId: string;
  lab: PodLab;
  result: DispatchedParcelResult;
}

const receipts = new Map<string, DispatchReceipt>();
const parcelReceipts = new Map<string, ParcelReceipt>();

function receiptKey(sessionId: string): string {
  return `webhook_receipt:${sessionId}`;
}

function parcelCacheKey(sessionId: string, lab: PodLab): string {
  return `${sessionId}\0${lab}`;
}

function parcelKvKey(sessionId: string, lab: PodLab): string {
  return `webhook_parcel:${sessionId}:${lab}`;
}

export async function readDispatchReceipt(
  sessionId: string,
  kv?: KVNamespaceLike
): Promise<DispatchReceipt | null> {
  const cached = receipts.get(sessionId);
  if (cached) return cached;
  if (!kv) return null;
  try {
    const raw = await kv.get(receiptKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DispatchReceipt;
    receipts.set(sessionId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function saveDispatchReceipt(receipt: DispatchReceipt, kv?: KVNamespaceLike): Promise<void> {
  receipts.set(receipt.sessionId, receipt);
  if (!kv) return;
  try {
    await kv.put(receiptKey(receipt.sessionId), JSON.stringify(receipt));
  } catch {
    // KV write failed. The in-memory receipt still dedupes this process; a
    // retried delivery will attempt the KV write again.
  }
}

export async function readParcelReceipt(
  sessionId: string,
  lab: PodLab,
  kv?: KVNamespaceLike
): Promise<ParcelReceipt | null> {
  const cacheKey = parcelCacheKey(sessionId, lab);
  const cached = parcelReceipts.get(cacheKey);
  if (cached) return cached;
  if (!kv) return null;
  try {
    const raw = await kv.get(parcelKvKey(sessionId, lab));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParcelReceipt;
    parcelReceipts.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Read every saved parcel receipt for a session across the labs an order touches. */
export async function readParcelReceipts(
  sessionId: string,
  labs: readonly PodLab[],
  kv?: KVNamespaceLike
): Promise<Partial<Record<PodLab, ParcelReceipt>>> {
  const out: Partial<Record<PodLab, ParcelReceipt>> = {};
  for (const lab of labs) {
    const receipt = await readParcelReceipt(sessionId, lab, kv);
    if (receipt) out[lab] = receipt;
  }
  return out;
}

export async function saveParcelReceipt(receipt: ParcelReceipt, kv?: KVNamespaceLike): Promise<void> {
  const cacheKey = parcelCacheKey(receipt.sessionId, receipt.lab);
  parcelReceipts.set(cacheKey, receipt);
  if (!kv) return;
  try {
    await kv.put(parcelKvKey(receipt.sessionId, receipt.lab), JSON.stringify(receipt));
  } catch {
    // Best effort. The in-memory receipt still prevents a double-order in this process.
  }
}

export function clearDispatchReceipts(): void {
  receipts.clear();
  parcelReceipts.clear();
}
