/**
 * Resolves the browser auth client base URL.
 *
 * Production (trycomp.ai): auth calls go directly to the API; cookies are shared
 * via `.trycomp.ai`.
 *
 * Self-hosted Railway (separate *.up.railway.app domains): auth is proxied
 * through the app at `/api/auth/*` so session cookies land on the app origin.
 */
export function resolveAuthClientBaseUrl(options?: {
  authViaAppProxy?: string;
  betterAuthUrl?: string;
  apiUrl?: string;
  windowOrigin?: string;
}): string {
  const viaProxy =
    options?.authViaAppProxy === 'true' || options?.authViaAppProxy === '1';

  if (viaProxy) {
    return (
      options?.betterAuthUrl ||
      options?.windowOrigin ||
      'http://localhost:3000'
    );
  }

  return (
    options?.apiUrl ||
    options?.betterAuthUrl ||
    'http://localhost:3333'
  );
}
