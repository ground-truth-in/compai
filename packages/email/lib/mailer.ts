import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { render } from '@react-email/render';
import {
  getEmailProvider,
  isEmailProviderConfigured,
  resolveDefaultFromAddress,
  resolveFromAddressForChannel,
  resolveFromAddressForFlags,
  resolveReplyToForFlags,
  resolveToAddress,
  resolveTriggerToAddress,
} from './email-config';
import type {
  BatchHtmlEmailItem,
  EmailAttachment,
  EmailChannel,
  SendEmailResult,
  SendHtmlEmailParams,
} from './email-types';
import { sendBatchViaBrevo, sendViaBrevo } from './providers/brevo';
import { sendBatchViaResend, sendViaResend } from './providers/resend';

export type { EmailAttachment } from './email-types';

export { isEmailProviderConfigured };

function maskEmail(value: string): string {
  const [name = '', domain = ''] = value.toLowerCase().split('@');
  if (!domain) return 'invalid-email';
  const safeName =
    name.length <= 2
      ? (name[0] ?? '')
      : `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;
  return `${safeName}@${domain}`;
}

function maskEmailList(value: string): string {
  return value
    .split(',')
    .map((email) => maskEmail(email.trim()))
    .join(', ');
}

async function dispatchHtmlEmail(
  params: SendHtmlEmailParams,
): Promise<SendEmailResult> {
  const provider = getEmailProvider();

  if (!isEmailProviderConfigured(provider)) {
    throw new Error(
      provider === 'brevo'
        ? 'Brevo not initialized - missing BREVO_API_KEY'
        : 'Resend not initialized - missing RESEND_API_KEY',
    );
  }

  if (!params.from) {
    throw new Error('Missing FROM address in environment variables');
  }

  const requestId = randomUUID();
  const startTime = Date.now();

  console.info('[email] send start', {
    requestId,
    provider,
    from: params.from,
    to: maskEmailList(params.to),
    subject: params.subject,
    scheduledAt: params.scheduledAt,
  });

  try {
    const result =
      provider === 'brevo'
        ? await sendViaBrevo(params)
        : await sendViaResend(params);

    console.info('[email] send success', {
      requestId,
      provider,
      to: maskEmailList(params.to),
      messageId: result.id,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    console.error('[email] send failure', {
      requestId,
      provider,
      to: maskEmailList(params.to),
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error('Failed to send email');
  }
}

export async function sendHtmlEmail(
  params: SendHtmlEmailParams & {
    channel?: EmailChannel;
    test?: boolean;
    useTriggerToOverride?: boolean;
  },
): Promise<SendEmailResult> {
  const fromAddress =
    params.from ??
    (params.channel
      ? resolveFromAddressForChannel(params.channel)
      : undefined) ??
    resolveDefaultFromAddress();

  if (!fromAddress) {
    throw new Error('Missing FROM address in environment variables');
  }

  const toAddress = params.useTriggerToOverride
    ? resolveTriggerToAddress(params.to)
    : resolveToAddress(params.to, { test: params.test });

  return dispatchHtmlEmail({
    ...params,
    from: fromAddress,
    to: toAddress,
  });
}

export async function sendReactEmail({
  to,
  subject,
  react,
  marketing,
  system,
  test,
  cc,
  scheduledAt,
  attachments,
}: {
  to: string;
  subject: string;
  react: ReactNode;
  marketing?: boolean;
  system?: boolean;
  test?: boolean;
  cc?: string | string[];
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}): Promise<{ message: string; id: string }> {
  const fromAddress = resolveFromAddressForFlags({ marketing, system });
  const toAddress = resolveToAddress(to, { test });
  const replyTo = resolveReplyToForFlags({ marketing });

  if (!fromAddress) {
    throw new Error('Missing FROM address in environment variables');
  }

  const html = await render(react);

  const result = await dispatchHtmlEmail({
    to: toAddress,
    subject,
    html,
    from: fromAddress,
    cc,
    replyTo,
    scheduledAt,
    attachments,
  });

  return {
    message: 'Email sent successfully',
    id: result.id,
  };
}

export async function sendBatchHtmlEmails(
  emails: BatchHtmlEmailItem[],
): Promise<{ sent: number; failed: number }> {
  const provider = getEmailProvider();

  if (!isEmailProviderConfigured(provider)) {
    throw new Error(
      provider === 'brevo'
        ? 'Brevo not initialized - missing BREVO_API_KEY'
        : 'Resend not initialized - missing RESEND_API_KEY',
    );
  }

  const fromDefault = resolveDefaultFromAddress();

  if (!fromDefault) {
    throw new Error('Missing FROM address in environment variables');
  }

  const normalized = emails.map((email) => ({
    from: email.from ?? fromDefault,
    to: resolveTriggerToAddress(email.to),
    cc: email.cc,
    subject: email.subject,
    html: email.html,
    headers: email.headers,
  }));

  if (provider === 'brevo') {
    return sendBatchViaBrevo(normalized);
  }

  return sendBatchViaResend(normalized);
}
