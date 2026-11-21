/**
 * Operator and customer email for paid print orders.
 * Resend is skipped when RESEND_API_KEY is unset. Callers keep any saved
 * dispatch receipt either way.
 */

export const DEFAULT_OPERATOR_EMAIL = 'alan@alanwoodyard.com';
export const DEFAULT_FROM_EMAIL = 'Alan Woodyard Photo <orders@alanwoodyard.photo>';

export interface NotificationEnv {
  RESEND_API_KEY?: string;
  OPERATOR_EMAIL?: string;
  RESEND_FROM?: string;
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

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers?: Record<string, string>;
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

export function usableResendKey(value: string | undefined): string | null {
  const key = clean(value);
  if (!key || key.includes('placeholder')) return null;
  return key;
}

function list(values: string[], emptyLabel: string): string {
  const items = values.map((value) => value.trim()).filter(Boolean);
  return items.length > 0 ? items.join(', ') : emptyLabel;
}

function noticeLines(notice: DispatchNotice): string[] {
  return [
    `Session: ${notice.sessionId}`,
    `Customer email: ${notice.customerEmail || 'none'}`,
    `Destination country: ${notice.destinationCountry || 'none'}`,
    `SKUs: ${list(notice.skus, 'none')}`,
    `Supplier order IDs: ${list(notice.supplierOrderIds, 'none')}`,
  ];
}

export function buildOperatorEmail(notice: DispatchNotice, env: NotificationEnv = {}): EmailMessage {
  const to = clean(env.OPERATOR_EMAIL) || DEFAULT_OPERATOR_EMAIL;
  const from = clean(env.RESEND_FROM) || DEFAULT_FROM_EMAIL;
  const lines = noticeLines(notice);

  if (notice.kind === 'failure') {
    lines.unshift('Supplier dispatch failed.');
    const errors = (notice.errors || []).map((error) => error.trim()).filter(Boolean);
    if (errors.length > 0) {
      lines.push(`Errors: ${errors.join(' | ')}`);
    }
    return {
      from,
      to: [to],
      subject: `Supplier dispatch failed ${notice.sessionId}`,
      text: lines.join('\n'),
      headers: {
        'X-Priority': '1',
        Importance: 'high',
        'X-MSMail-Priority': 'High',
      },
    };
  }

  lines.unshift('A paid print order was sent to the production partner.');
  return {
    from,
    to: [to],
    subject: `Order dispatched ${notice.sessionId}`,
    text: lines.join('\n'),
  };
}

export function buildCustomerReceiptEmail(notice: DispatchNotice, env: NotificationEnv = {}): EmailMessage {
  const from = clean(env.RESEND_FROM) || DEFAULT_FROM_EMAIL;
  const lines = [
    'Your print order is paid and has been sent to the production partner.',
    `Session: ${notice.sessionId}`,
    `SKUs: ${list(notice.skus, 'none')}`,
    `Destination country: ${notice.destinationCountry || 'none'}`,
  ];
  return {
    from,
    to: [notice.customerEmail],
    subject: `Print order received ${notice.sessionId}`,
    text: lines.join('\n'),
  };
}

async function sendResend(
  apiKey: string,
  message: EmailMessage,
  fetchImpl: typeof fetch
): Promise<{ sent: boolean; error?: string }> {
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.headers ? { headers: message.headers } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[notify] Resend rejected an email', res.status, body.slice(0, 300));
      return { sent: false, error: `Resend HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.error('[notify] Resend request failed', messageText);
    return { sent: false, error: 'Resend request failed' };
  }
}

export async function deliverOrderNotifications(
  env: NotificationEnv,
  notice: DispatchNotice,
  fetchImpl: typeof fetch = fetch
): Promise<NotificationResult> {
  const apiKey = usableResendKey(env.RESEND_API_KEY);
  if (!apiKey) {
    console.error('[notify] RESEND_API_KEY is unset. Order notification was not sent.');
    return { operatorSent: false, operatorSkipped: true, customerSent: false };
  }

  const operator = await sendResend(apiKey, buildOperatorEmail(notice, env), fetchImpl);
  let customerSent = false;
  if (notice.kind === 'dispatch' && notice.customerEmail.includes('@')) {
    const customer = await sendResend(apiKey, buildCustomerReceiptEmail(notice, env), fetchImpl);
    customerSent = customer.sent;
    if (!customer.sent) {
      console.error('[notify] Customer receipt was not sent', customer.error || 'unknown error');
    }
  }

  return {
    operatorSent: operator.sent,
    operatorSkipped: false,
    customerSent,
    error: operator.error,
  };
}
