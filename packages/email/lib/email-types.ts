export type EmailProviderName = 'resend' | 'brevo';

export type EmailChannel =
  | 'marketing'
  | 'system'
  | 'trustPortal'
  | 'default';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendHtmlEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  cc?: string | string[];
  replyTo?: string;
  headers?: Record<string, string>;
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}

export interface BatchHtmlEmailItem {
  to: string;
  subject: string;
  html: string;
  from?: string;
  cc?: string | string[];
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
}
