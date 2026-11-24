const UMAMI_ORIGIN = 'https://analytics.alanwoodyard.com';

type CloudflareRequest = Request & {
  cf?: {
    colo?: string;
    country?: string;
    httpProtocol?: string;
    tlsVersion?: string;
  };
};

function edgeHeaders(request: CloudflareRequest): HeadersInit {
  const headers: Record<string, string> = {
    'X-Telemetry-Mode': 'sovereign-first-party',
  };
  const colo = request.cf?.colo;
  if (colo) headers['X-Edge-Colo'] = colo;
  const proto = request.cf?.httpProtocol;
  if (proto) headers['X-Edge-Protocol'] = proto;
  return headers;
}

/**
 * Proxy the Umami tracking script from analytics.alanwoodyard.com under a first-party path.
 */
export async function proxyUmamiScript(request: Request): Promise<Response> {
  const upstream = await fetch(`${UMAMI_ORIGIN}/script.js`, {
    method: 'GET',
    headers: {
      Accept: 'application/javascript, text/javascript, */*',
    },
  });

  if (!upstream.ok) {
    return new Response('/* analytics upstream unavailable */', {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        ...edgeHeaders(request as CloudflareRequest),
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      ...edgeHeaders(request as CloudflareRequest),
    },
  });
}

/**
 * Forward first-party Umami collection beacons to analytics.alanwoodyard.com/api/send.
 */
export async function proxyUmamiSend(request: Request): Promise<Response> {
  const cfReq = request as CloudflareRequest;
  const forwardHeaders = new Headers({
    'Content-Type': request.headers.get('Content-Type') || 'application/json',
  });

  const passthroughHeaders = [
    'User-Agent',
    'Accept-Language',
    'CF-IPCountry',
    'x-umami-website-id',
    'x-umami-hostname',
    'x-umami-cache',
  ];

  for (const name of passthroughHeaders) {
    const val = request.headers.get(name);
    if (val) forwardHeaders.set(name, val);
  }

  const clientIp =
    request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For');
  if (clientIp) {
    forwardHeaders.set('X-Forwarded-For', clientIp);
  }

  const body = await request.text();
  const upstream = await fetch(`${UMAMI_ORIGIN}/api/send`, {
    method: 'POST',
    headers: forwardHeaders,
    body,
  });

  const respHeaders = new Headers(edgeHeaders(cfReq));
  respHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
  respHeaders.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
