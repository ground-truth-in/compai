import { logger, queue, schemaTask } from '@trigger.dev/sdk';
import { z } from 'zod';
import {
  generateUnsubscribeToken,
  isEmailProviderConfigured,
  resolveDefaultFromAddress,
  sendBatchHtmlEmails,
} from '@trycompai/email';

const RESEND_BATCH_LIMIT = 100;

const batchEmailQueue = queue({
  name: 'send-batch-email',
  concurrencyLimit: 5,
});

const batchEmailItemSchema = z.object({
  to: z.string(),
  subject: z.string(),
  html: z.string(),
  from: z.string().optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
});

export const sendBatchEmailTask = schemaTask({
  id: 'send-batch-email',
  queue: batchEmailQueue,
  retry: {
    maxAttempts: 3,
  },
  schema: z.object({
    emails: z.array(batchEmailItemSchema).min(1),
  }),
  run: async (params) => {
    if (!isEmailProviderConfigured()) {
      logger.error('Email provider not initialized', {
        provider: process.env.EMAIL_PROVIDER ?? 'resend',
      });
      throw new Error('Email provider not initialized - missing API key');
    }

    const fromDefault = resolveDefaultFromAddress();

    if (!fromDefault) {
      throw new Error('Missing FROM address in environment variables');
    }

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || 'https://api.trycomp.ai';

    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < params.emails.length; i += RESEND_BATCH_LIMIT) {
      const chunk = params.emails.slice(i, i + RESEND_BATCH_LIMIT);

      const payload = chunk.map((email) => {
        const token = generateUnsubscribeToken(email.to);
        const oneClickUrl = `${apiBaseUrl}/v1/email/unsubscribe?email=${encodeURIComponent(email.to)}&token=${encodeURIComponent(token)}`;

        return {
          from: email.from ?? fromDefault,
          to: email.to,
          cc: email.cc,
          subject: email.subject,
          html: email.html,
          headers: {
            'List-Unsubscribe': `<${oneClickUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      try {
        const { sent, failed } = await sendBatchHtmlEmails(payload);
        totalSent += sent;
        totalFailed += failed;

        logger.info('Batch chunk sent', {
          chunkIndex: i,
          chunkSize: chunk.length,
          sent,
          failed,
        });
      } catch (error) {
        logger.error('Batch email chunk failed', {
          chunkIndex: i,
          chunkSize: chunk.length,
          error: error instanceof Error ? error.message : String(error),
        });
        totalFailed += chunk.length;
      }
    }

    logger.info('Batch email task complete', { totalSent, totalFailed });
    return { totalSent, totalFailed };
  },
});
