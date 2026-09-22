// The e-mail channel. With a Resend key it sends for real; without one it
// writes the message to a file under `DATA_DIR/outbox/` and logs where, which
// is how sign-in links are read during development — no mail server, no
// account, nothing to configure before the first screen works.
//
// A channel is this small on purpose: adding Slack or Telegram later means
// writing one more object with a `send`, not touching anything that calls it.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';
import { config } from '../config.ts';
import { log } from '../log.ts';

export type Message = {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
};

export type Channel = {
  readonly name: string;
  send(message: Message): Promise<void>;
};

const outbox: Channel = {
  name: 'email',
  async send(message) {
    await mkdir(config.outboxDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(config.outboxDir, `${stamp}-${Math.random().toString(36).slice(2, 8)}.eml`);
    const body = [
      `From: ${config.emailFrom}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `Date: ${new Date().toUTCString()}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      message.text,
    ].join('\n');
    await writeFile(file, body, 'utf8');
    log.info({ outbox: file }, 'email written to the development outbox');
  },
};

const resendChannel = (apiKey: string): Channel => {
  const client = new Resend(apiKey);
  return {
    name: 'email',
    async send(message) {
      // Resend answers with `{ data, error }` rather than throwing, so an
      // unread `error` looks exactly like a message that went out.
      const { error } = await client.emails.send({
        from: config.emailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
      if (error) throw new Error(`${error.name ?? 'send failed'}: ${error.message ?? 'no reason given'}`);
    },
  };
};

export const emailChannel: Channel = config.resendApiKey ? resendChannel(config.resendApiKey) : outbox;
