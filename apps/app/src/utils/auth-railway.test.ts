import { describe, expect, it } from 'vitest';
import { isValidRedirectPath } from './auth-callback';
import { resolveAuthClientBaseUrl } from './auth-base-url';

describe('isValidRedirectPath', () => {
  it('rejects framework internal paths used as redirectTo', () => {
    expect(isValidRedirectPath('/_vercel/insights/script.js')).toBe(false);
    expect(isValidRedirectPath('/_next/static/chunks/main.js')).toBe(false);
    expect(isValidRedirectPath('/api/health')).toBe(false);
  });

  it('allows normal app paths', () => {
    expect(isValidRedirectPath('/org_123/dashboard')).toBe(true);
    expect(isValidRedirectPath('/')).toBe(true);
  });
});

describe('resolveAuthClientBaseUrl', () => {
  it('uses the app origin when auth is proxied through the app', () => {
    expect(
      resolveAuthClientBaseUrl({
        authViaAppProxy: '1',
        betterAuthUrl: 'https://app.example.com',
        apiUrl: 'https://api.example.com',
      }),
    ).toBe('https://app.example.com');
  });

  it('uses the API URL on shared cookie domain deployments', () => {
    expect(
      resolveAuthClientBaseUrl({
        betterAuthUrl: 'https://app.trycomp.ai',
        apiUrl: 'https://api.trycomp.ai',
      }),
    ).toBe('https://api.trycomp.ai');
  });
});
