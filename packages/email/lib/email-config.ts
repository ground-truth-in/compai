import type { EmailChannel, EmailProviderName } from './email-types';

const EMAIL_PROVIDER_VALUES = ['resend', 'brevo'] as const;

export function getEmailProvider(): EmailProviderName {
  const raw = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (raw && !EMAIL_PROVIDER_VALUES.includes(raw as EmailProviderName)) {
    throw new Error(
      `Invalid EMAIL_PROVIDER "${raw}". Expected "resend" or "brevo".`,
    );
  }

  return (raw as EmailProviderName | undefined) ?? 'resend';
}

export function isEmailProviderConfigured(
  provider: EmailProviderName = getEmailProvider(),
): boolean {
  if (provider === 'brevo') {
    return Boolean(process.env.BREVO_API_KEY?.trim());
  }

  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function resolveToAddress(
  to: string,
  options?: { test?: boolean },
): string {
  const testInbox = process.env.RESEND_TO_TEST;

  if (options?.test && testInbox) {
    return testInbox;
  }

  return to;
}

/** Trigger tasks redirect all mail when RESEND_TO_TEST is set. */
export function resolveTriggerToAddress(to: string): string {
  return process.env.RESEND_TO_TEST ?? to;
}

export function resolveFromAddressForChannel(
  channel: EmailChannel | undefined,
): string | undefined {
  const fromMarketing = process.env.RESEND_FROM_MARKETING;
  const fromSystem = process.env.RESEND_FROM_SYSTEM;
  const fromDefault = process.env.RESEND_FROM_DEFAULT;
  const fromTrustPortal = process.env.RESEND_FROM_TRUST_PORTAL;

  switch (channel) {
    case 'trustPortal':
      return fromTrustPortal ?? fromSystem;
    case 'marketing':
      return fromMarketing;
    case 'system':
      return fromSystem;
    case 'default':
      return fromDefault;
    default:
      return undefined;
  }
}

export function resolveFromAddressForFlags(flags: {
  marketing?: boolean;
  system?: boolean;
}): string | undefined {
  if (flags.marketing) {
    return process.env.RESEND_FROM_MARKETING;
  }

  if (flags.system) {
    return process.env.RESEND_FROM_SYSTEM;
  }

  return process.env.RESEND_FROM_DEFAULT;
}

export function resolveReplyToForFlags(flags: {
  marketing?: boolean;
}): string | undefined {
  if (flags.marketing) {
    return process.env.RESEND_REPLY_TO_MARKETING;
  }

  return undefined;
}

export function resolveDefaultFromAddress(): string | undefined {
  return (
    process.env.RESEND_FROM_SYSTEM ?? process.env.RESEND_FROM_DEFAULT
  );
}
