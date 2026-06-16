import { env } from '@/env.mjs';

const API_BASE =
  env.BACKEND_API_URL || env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';

const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'origin',
  'cookie',
  'authorization',
  'user-agent',
] as const;

/**
 * Proxies `/api/auth/*` on the app to the NestJS API so session cookies are
 * set on the app origin (required when API and app are on different domains).
 */
export async function proxyAuthRequest(
  req: Request,
  pathSegments: string[],
): Promise<Response> {
  const incomingUrl = new URL(req.url);
  const path = pathSegments.join('/');
  const target = `${API_BASE}/api/auth/${path}${incomingUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const response = await fetch(target, init);

  const responseHeaders = new Headers();
  const contentType = response.headers.get('Content-Type');
  if (contentType) {
    responseHeaders.set('Content-Type', contentType);
  }

  const location = response.headers.get('Location');
  if (location) {
    responseHeaders.set('Location', location);
  }

  for (const cookie of response.headers.getSetCookie()) {
    responseHeaders.append('Set-Cookie', cookie);
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
