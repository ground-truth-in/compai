import { randomUUID } from 'node:crypto';
import type { SendHtmlEmailParams, SendEmailResult } from '../email-types';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface ParsedFromAddress {
  email: string;
  name?: string;
}

interface BrevoRecipient {
  email: string;
}

interface BrevoAttachment {
  name: string;
  content: string;
}

function parseFromAddress(from: string): ParsedFromAddress {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);

  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  return { email: from.trim() };
}

function toRecipients(value: string | string[]): BrevoRecipient[] {
  const list = Array.isArray(value) ? value : [value];

  return list.map((email) => ({ email: email.trim() }));
}

function attachmentContent(content: Buffer | string): string {
  if (typeof content === 'string') {
    return content;
  }

  return content.toString('base64');
}

function getBrevoApiKey(): string {
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Brevo not initialized - missing BREVO_API_KEY');
  }

  return apiKey;
}

export async function sendViaBrevo(
  params: SendHtmlEmailParams,
): Promise<SendEmailResult> {
  const from = parseFromAddress(params.from ?? '');

  const body: Record<string, unknown> = {
    sender: from.name ? { email: from.email, name: from.name } : { email: from.email },
    to: toRecipients(params.to),
    subject: params.subject,
    htmlContent: params.html,
  };

  if (params.cc) {
    body.cc = toRecipients(params.cc);
  }

  if (params.replyTo) {
    body.replyTo = { email: params.replyTo };
  }

  if (params.headers && Object.keys(params.headers).length > 0) {
    body.headers = params.headers;
  }

  if (params.scheduledAt) {
    body.scheduledAt = params.scheduledAt;
  }

  if (params.attachments?.length) {
    body.attachment = params.attachments.map(
      (att): BrevoAttachment => ({
        name: att.filename,
        content: attachmentContent(att.content),
      }),
    );
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': getBrevoApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to send email via Brevo (${response.status}): ${errorBody}`,
    );
  }

  const payload: { messageId?: string } = await response.json();

  return { id: payload.messageId ?? randomUUID() };
}

export async function sendBatchViaBrevo(
  emails: SendHtmlEmailParams[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      await sendViaBrevo(email);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}
