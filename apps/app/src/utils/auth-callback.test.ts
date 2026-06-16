import { describe, expect, it } from 'vitest';
import { isValidRedirectPath } from './auth-callback';

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
