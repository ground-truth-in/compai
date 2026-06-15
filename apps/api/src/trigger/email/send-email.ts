import { logger, queue, schemaTask } from '@trigger.dev/sdk';
import { z } from 'zod';
import {
  generateUnsubscribeToken,
  isEmailProviderConfigured,
  resolveDefaultFromAddress,
  resolveFromAddressForChannel,
  sendHtmlEmail,
  type EmailChannel,
} from '@trycompai/email';

const emailQueue = queue({
  name: 'send-email',
  concurrencyLimit: 10,
});

export const emailChannelSchema = z.enum([
  'marketing',
  'system',
  'trustPortal',
  'default',
]);
export type { EmailChannel };

export const sendEmailTask = schemaTask({
  id: 'send-email',
  queue: emailQueue,
  retry: {
    maxAttempts: 3,
  },
  schema: z.object({
    to: z.string(),
    subject: z.string(),
    html: z.string(),
    channel: emailChannelSchema.optional(),
    from: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    scheduledAt: z.string().optional(),
    attachments: z
      .array(
        z.object({
          filename: z.string(),
          content: z.string(),
          contentType: z.string().optional(),
        }),
      )
      .optional(),
  }),
  run: async (params) => {
    if (!isEmailProviderConfigured()) {
      logger.error('Email provider not initialized', {
        provider: process.env.EMAIL_PROVIDER ?? 'resend',
        to: params.to,
        subject: params.subject,
      });
      throw new Error('Email provider not initialized - missing API key');
    }

    const fromAddress =
      params.from ??
      resolveFromAddressForChannel(params.channel) ??
      resolveDefaultFromAddress();

    if (!fromAddress) {
      throw new Error('Missing FROM address in environment variables');
    }

    try {
      const apiBaseUrl =
        process.env.NEXT_PUBLIC_API_URL || 'https://api.trycomp.ai';
      const token = generateUnsubscribeToken(params.to);
      const oneClickUrl = `${apiBaseUrl}/v1/email/unsubscribe?email=${encodeURIComponent(params.to)}&token=${encodeURIComponent(token)}`;
      const headers: Record<string, string> = {
        'List-Unsubscribe': `<${oneClickUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };

      const result = await sendHtmlEmail({
        to: params.to,
        subject: params.subject,
        html: params.html,
        from: fromAddress,
        cc: params.cc,
        headers,
        scheduledAt: params.scheduledAt,
        attachments: params.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
        useTriggerToOverride: true,
      });

      logger.info('Email sent', { to: params.to, id: result.id });

      await new Promise((r) => setTimeout(r, 1000));

      return { id: result.id };
    } catch (error) {
      logger.error('Email sending failed', {
        to: params.to,
        subject: params.subject,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
