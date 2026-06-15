import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { EmailAttachment, SendHtmlEmailParams, SendEmailResult } from '../email-types';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Resend not initialized - missing RESEND_API_KEY');
  }

  return new Resend(apiKey);
}

function normalizeAttachmentContent(content: Buffer | string): string | Buffer {
  return content;
}

export async function sendViaResend(
  params: SendHtmlEmailParams,
): Promise<SendEmailResult> {
  const resend = getResendClient();

  const { data, error } = await resend.emails.send({
    from: params.from ?? '',
    to: params.to,
    cc: params.cc,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    headers: params.headers,
    scheduledAt: params.scheduledAt,
    attachments: params.attachments?.map((att: EmailAttachment) => ({
      filename: att.filename,
      content: normalizeAttachmentContent(att.content),
      contentType: att.contentType,
    })),
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return { id: data?.id ?? randomUUID() };
}

export async function sendBatchViaResend(
  emails: Array<{
    from: string;
    to: string;
    cc?: string | string[];
    subject: string;
    html: string;
    headers?: Record<string, string>;
  }>,
): Promise<{ sent: number; failed: number }> {
  const resend = getResendClient();

  const { data, error } = await resend.batch.send(emails, {
    batchValidation: 'permissive',
  });

  if (error) {
    throw new Error(`Failed to send batch email: ${error.message}`);
  }

  let failed = 0;

  if (data && 'errors' in data && Array.isArray(data.errors)) {
    failed = data.errors.length;
  }

  const sent = data?.data?.length ?? 0;

  return { sent, failed };
}
