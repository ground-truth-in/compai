import { afterEach, describe, expect, it } from 'vitest';
import {
  getEmailProvider,
  isEmailProviderConfigured,
  resolveFromAddressForChannel,
  resolveToAddress,
  resolveTriggerToAddress,
} from './email-config';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getEmailProvider', () => {
  it('defaults to resend', () => {
    delete process.env.EMAIL_PROVIDER;
    expect(getEmailProvider()).toBe('resend');
  });

  it('returns brevo when configured', () => {
    process.env.EMAIL_PROVIDER = 'brevo';
    expect(getEmailProvider()).toBe('brevo');
  });

  it('throws for invalid provider', () => {
    process.env.EMAIL_PROVIDER = 'mailgun';
    expect(() => getEmailProvider()).toThrow(/Invalid EMAIL_PROVIDER/);
  });
});

describe('isEmailProviderConfigured', () => {
  it('checks RESEND_API_KEY for resend', () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    expect(isEmailProviderConfigured('resend')).toBe(false);

    process.env.RESEND_API_KEY = 're_test';
    expect(isEmailProviderConfigured('resend')).toBe(true);
  });

  it('checks BREVO_API_KEY for brevo', () => {
    delete process.env.BREVO_API_KEY;
    expect(isEmailProviderConfigured('brevo')).toBe(false);

    process.env.BREVO_API_KEY = 'xkeysib-test';
    expect(isEmailProviderConfigured('brevo')).toBe(true);
  });
});

describe('resolveToAddress', () => {
  it('redirects only when test flag is set', () => {
    process.env.RESEND_TO_TEST = 'qa@example.com';
    expect(resolveToAddress('user@example.com')).toBe('user@example.com');
    expect(resolveToAddress('user@example.com', { test: true })).toBe(
      'qa@example.com',
    );
  });
});

describe('resolveTriggerToAddress', () => {
  it('always uses RESEND_TO_TEST when set', () => {
    process.env.RESEND_TO_TEST = 'qa@example.com';
    expect(resolveTriggerToAddress('user@example.com')).toBe('qa@example.com');
  });
});

describe('resolveFromAddressForChannel', () => {
  it('resolves trust portal from address with fallback', () => {
    process.env.RESEND_FROM_TRUST_PORTAL = 'trust@example.com';
    delete process.env.RESEND_FROM_SYSTEM;
    expect(resolveFromAddressForChannel('trustPortal')).toBe(
      'trust@example.com',
    );

    delete process.env.RESEND_FROM_TRUST_PORTAL;
    process.env.RESEND_FROM_SYSTEM = 'system@example.com';
    expect(resolveFromAddressForChannel('trustPortal')).toBe(
      'system@example.com',
    );
  });
});
