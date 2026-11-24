/**
 * Operator alerts for paid print orders.
 * Telegram is used only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are both set.
 * Otherwise the structured summary is logged and callers keep any saved dispatch receipt.
 */

export interface NotificationEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface DispatchNotice {
  kind: 'dispatch' | 'failure';
  sessionId: string;
  customerEmail: string;
  destinationCountry: string;
  skus: string[];
  supplierOrderIds: string[];
  errors?: string[];
}

export interface NotificationResult {
  operatorSent: boolean;
  operatorSkipped: boolean;
  customerSent: boolean;
  error?: string;
}

function clean(value: string | undefined): string {
  return (value || '').trim();
}

function list(values: string[], emptyLabel: string): string {
  const items = values.map((value) => value.trim()).filter(Boolean);
  return items.length > 0 ? items.join(', ') : emptyLabel;
}

export function buildAlertSummary(notice: DispatchNotice): string {
  const lines = [
    `Session: ${notice.sessionId}`,
    `Customer email: ${notice.customerEmail || 'none'}`,
    `Destination country: ${notice.destinationCountry || 'none'}`,
    `SKUs: ${list(notice.skus, 'none')}`,
    `Supplier order IDs: ${list(notice.supplierOrderIds, 'none')}`,
  ];

  if (notice.kind === 'failure') {
    lines.unshift(`Supplier dispatch failed ${notice.sessionId}`);
    const errors = (notice.errors || []).map((error) => error.trim()).filter(Boolean);
    if (errors.length > 0) {
      lines.push(`Errors: ${errors.join(' | ')}`);
    }
    return lines.join('\n');
  }

  lines.unshift(`Order dispatched ${notice.sessionId}`);
  return lines.join('\n');
}

function telegramTarget(env: NotificationEnv): { token: string; chatId: string } | null {
  const token = clean(env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return null;
  return { token, chatId };
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch
): Promise<{ sent: boolean; error?: string }> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[notify] Telegram rejected a message', res.status, body.slice(0, 300));
      return { sent: false, error: `Telegram HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error('[notify] Telegram request failed', messageText);
    return { sent: false, error: 'Telegram request failed' };
  }
}

export async function deliverOrderNotifications(
  env: NotificationEnv,
  notice: DispatchNotice,
  fetchImpl: typeof fetch = fetch
): Promise<NotificationResult> {
  const summary = buildAlertSummary(notice);
  const target = telegramTarget(env);
  if (!target) {
    console.info(`[notify] order alert\n${summary}`);
    return { operatorSent: false, operatorSkipped: true, customerSent: false };
  }

  const operator = await sendTelegram(target.token, target.chatId, summary, fetchImpl);
  return {
    operatorSent: operator.sent,
    operatorSkipped: false,
    customerSent: false,
    error: operator.error,
  };
}
