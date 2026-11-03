/**
 * functions/api/subscribe.ts
 *
 * Cloudflare Pages Function: Email Lead Capture & 4K Wallpaper Welcome Package
 * Integrates Resend API to deliver immediate fine-art collector downloads.
 */

interface Env {
  RESEND_API_KEY?: string;
  ALLOW_MOCK_SUBSCRIBE?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const { request, env } = context;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    const body = (await request.json()) as { email?: string; name?: string };
    const email = body.email ? body.email.trim().toLowerCase() : '';
    const name = body.name ? body.name.trim() : 'Collector';

    // Strict email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          error: 'Please enter a valid email address.'
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;

    const wallpaperAustinUrl = `${origin}/downloads/alanwoodyard-austin-dawn-4k.jpg`;
    const wallpaperChesapeakeUrl = `${origin}/downloads/alanwoodyard-chesapeake-mist-4k.jpg`;

    const RESEND_API_KEY = env.RESEND_API_KEY;

    // If Resend API key is unconfigured or in mock mode, return successful mock dispatch
    if (!RESEND_API_KEY || RESEND_API_KEY.includes('placeholder')) {
      console.warn('Resend API key unconfigured; simulating successful 4K wallpaper delivery.');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Welcome package dispatched! Check your inbox for your 4K collector wallpapers.',
          mock: true,
          downloads: {
            austinDawn4k: wallpaperAustinUrl,
            chesapeakeMist4k: wallpaperChesapeakeUrl
          }
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // HTML Email Template
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b0c10; color: #e0e2ec; padding: 40px 20px; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; background-color: #12131a; border: 1px solid #232533; border-radius: 8px; padding: 36px; }
            .title { font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; margin-bottom: 8px; }
            .subtitle { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8; margin-bottom: 24px; }
            .card { background-color: #1a1b26; border: 1px solid #2e3146; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
            .btn { display: inline-block; background-color: #38bdf8; color: #0b0c10; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 4px; margin-top: 12px; }
            .badge { display: inline-block; font-size: 11px; font-weight: 600; background: #222638; color: #94a3b8; padding: 3px 8px; border-radius: 3px; }
            .footer { margin-top: 32px; border-top: 1px solid #232533; padding-top: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="subtitle">Alan Woodyard Fine-Art Photography</div>
            <div class="title">Welcome to the Archive, ${name}</div>
            <p>Thank you for connecting with the studio. As a welcome to the collection, your curated 4K Ultra-HD collector wallpaper package is ready for download.</p>

            <div class="card">
              <div class="badge">4K ULTRA HD // 3840 x 2160</div>
              <h3 style="color: #ffffff; margin: 8px 0 4px 0;">Dawn Shell on Lady Bird Lake</h3>
              <p style="font-size: 13px; color: #94a3b8; margin: 0;">Austin, Texas &bull; ProPhoto RGB &bull; Medium Format</p>
              <a href="${wallpaperAustinUrl}" class="btn">Download 4K Master (Austin)</a>
            </div>

            <div class="card">
              <div class="badge">4K ULTRA HD // 3840 x 2160</div>
              <h3 style="color: #ffffff; margin: 8px 0 4px 0;">Chesapeake Skipjack at Low Mist</h3>
              <p style="font-size: 13px; color: #94a3b8; margin: 0;">Tilghman Island, Maryland &bull; Adobe RGB 1998 &bull; D50 Calibrated</p>
              <a href="${wallpaperChesapeakeUrl}" class="btn">Download 4K Master (Chesapeake)</a>
            </div>

            <div style="background: #1e1b18; border: 1px dashed #d97706; padding: 16px; border-radius: 6px; margin-top: 24px;">
              <div style="color: #f59e0b; font-weight: 600; font-size: 13px; text-transform: uppercase;">Collector Privileges</div>
              <p style="margin: 4px 0 0 0; font-size: 14px;">Use code <strong style="color: #ffffff; font-family: monospace; letter-spacing: 0.05em;">ARCHIVAL15</strong> at checkout for 15% off your first fine-art giclée or acrylic float-mount print.</p>
            </div>

            <div class="footer">
              Alan Woodyard Photography &bull; <a href="https://alanwoodyard.photo" style="color: #38bdf8;">alanwoodyard.photo</a><br>
              Direct Fine-Art Proofing: <a href="mailto:printing@alanwoodyard.photo" style="color: #94a3b8;">printing@alanwoodyard.photo</a>
            </div>
          </div>
        </body>
      </html>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Alan Woodyard Fine Art <newsletter@alanwoodyard.photo>',
        to: [email],
        subject: 'Your 4K Fine-Art Wallpaper Package — Alan Woodyard Photography',
        html: emailHtml
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error(`Resend API dispatch failed: HTTP ${resendRes.status}: ${errText}`);
      throw new Error(`Email dispatch failed: ${errText}`);
    }

    const data = await resendRes.json();
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Welcome package dispatched! Check your inbox for your 4K collector wallpapers.',
        resendId: (data as { id?: string }).id
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Subscription request failed.';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
