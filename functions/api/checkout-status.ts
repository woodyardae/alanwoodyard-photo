/**
 * functions/api/checkout-status.ts
 *
 * Cloudflare Pages Function: Query Stripe Checkout Session Status
 */

interface Env {
  STRIPE_SECRET_KEY?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing session_id parameter.' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Handle mock checkout sessions
  if (sessionId.startsWith('cs_mock_')) {
    return new Response(
      JSON.stringify({
        paid: true,
        sessionId,
        status: 'complete',
        mock: true
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('placeholder')) {
    return new Response(
      JSON.stringify({ error: 'Stripe secret key unconfigured.' }),
      { status: 503, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Session lookup failed.', status: res.status }), {
        status: res.status,
        headers: corsHeaders
      });
    }

    const session = (await res.json()) as { payment_status?: string; status?: string };
    const paid = session.payment_status === 'paid';

    return new Response(
      JSON.stringify({
        paid,
        sessionId,
        status: session.status
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Status inquiry error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
