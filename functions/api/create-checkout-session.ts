/**
 * Cloudflare Pages Function: create embedded Stripe Checkout session.
 * Contract matches src/pages/checkout.astro:
 *   { clientSecret, publishableKey } or { simulated: true, returnUrl }
 */

import pricingMatrix from '../../src/content/pricing-matrix.json';
import { parseAllowedCountriesConfig, parseEnabledVendorsConfig } from '../../src/lib/checkout-catalog';
import {
  createEmbeddedCheckoutSession,
  type CheckoutCartItem,
  type PricingMatrixEntry,
} from '../../src/lib/create-checkout-session';

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLIC_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  ALLOW_SIMULATED_CHECKOUT?: string;
  PRINT_MASTERS_BASE_URL?: string;
  PRINT_MASTERS_EXTENSION?: string;
  ALLOW_CLEAN_PREVIEW_ASSETS?: string;
  CHECKOUT_ENABLED_VENDORS?: string;
  CHECKOUT_ALLOWED_COUNTRIES?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;

  try {
    const body = (await request.json()) as {
      items: CheckoutCartItem[];
      customerEmail?: string;
      nonce?: string;
    };

    const result = await createEmbeddedCheckoutSession({
      items: body.items,
      customerEmail: body.customerEmail,
      origin: new URL(request.url).origin,
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      stripePublishableKey: env.STRIPE_PUBLIC_KEY || env.STRIPE_PUBLISHABLE_KEY,
      pricingMatrix: pricingMatrix as Record<string, PricingMatrixEntry>,
      allowSimulatedCheckout: env.ALLOW_SIMULATED_CHECKOUT === '1',
      printMastersBaseUrl: env.PRINT_MASTERS_BASE_URL,
      printMastersExtension: env.PRINT_MASTERS_EXTENSION,
      allowCleanPreviewAssets: env.ALLOW_CLEAN_PREVIEW_ASSETS === '1',
      enabledVendors: parseEnabledVendorsConfig(env.CHECKOUT_ENABLED_VENDORS),
      allowedCountries: parseAllowedCountriesConfig(env.CHECKOUT_ALLOWED_COUNTRIES),
      attemptNonce: body.nonce,
    });

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout session error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
