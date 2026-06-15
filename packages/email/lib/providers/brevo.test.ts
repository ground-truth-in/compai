import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendViaBrevo } from './providers/brevo';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('sendViaBrevo', () => {
  it('sends transactional email with parsed sender and headers', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test-key';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'brevo-123' }),
    });
    global.fetch = fetchMock;

    const result = await sendViaBrevo({
      from: 'Comp AI <noreply@example.com>',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      headers: {
        'List-Unsubscribe': '<https://api.example.com/unsubscribe>',
      },
    });

    expect(result.id).toBe('brevo-123');
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({
      'api-key': 'xkeysib-test-key',
    });

    const body = JSON.parse(String(init.body)) as {
      sender: { email: string; name: string };
      to: Array<{ email: string }>;
      htmlContent: string;
      headers: Record<string, string>;
    };

    expect(body.sender).toEqual({
      email: 'noreply@example.com',
      name: 'Comp AI',
    });
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.htmlContent).toBe('<p>Hi</p>');
    expect(body.headers['List-Unsubscribe']).toContain('unsubscribe');
  });

  it('throws when BREVO_API_KEY is missing', async () => {
    delete process.env.BREVO_API_KEY;

    await expect(
      sendViaBrevo({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      }),
    ).rejects.toThrow(/missing BREVO_API_KEY/);
  });

  it('throws when Brevo API returns an error', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test-key';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      sendViaBrevo({
        from: 'noreply@example.com',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      }),
    ).rejects.toThrow(/Failed to send email via Brevo \(401\)/);
  });
});
