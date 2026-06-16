import {
  adminClient,
  emailOTPClient,
  magicLinkClient,
  multiSessionClient,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { ac, allRoles } from './permissions';
import { resolveAuthClientBaseUrl } from './auth-base-url';

/**
 * Auth client for browser-side authentication.
 *
 * On trycomp.ai, calls the API directly with cross-subdomain cookies.
 * On self-hosted Railway (separate domains), set NEXT_PUBLIC_AUTH_VIA_APP_PROXY=1
 * so auth is proxied through this app and cookies stay on the app origin.
 *
 * For server-side session validation, use auth.ts instead.
 */
const BASE_URL = resolveAuthClientBaseUrl({
  authViaAppProxy: process.env.NEXT_PUBLIC_AUTH_VIA_APP_PROXY,
  betterAuthUrl: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  windowOrigin:
    typeof window !== 'undefined' ? window.location.origin : undefined,
});

export const authClient = createAuthClient({
  baseURL: BASE_URL,
  plugins: [
    organizationClient({
      ac,
      roles: allRoles,
    }),
    adminClient(),
    emailOTPClient(),
    magicLinkClient(),
    multiSessionClient(),
  ],
  // Authentication is handled via httpOnly cookies - no localStorage tokens needed
});

export const {
  signIn,
  signOut,
  useSession,
  useActiveOrganization,
  organization,
  useListOrganizations,
  useActiveMember,
} = authClient;
