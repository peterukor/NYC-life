// =====================================================================
// mailer.ts — sending email (password resets, verifying your address).
// With RESEND_API_KEY set, mail goes out through Resend (resend.com).
// Without it, emails are printed to the server log and kept in `outbox`
// (local development and tests).
// =====================================================================

import { CONFIG } from './config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export class LogMailer implements Mailer {
  readonly outbox: Mail[] = [];
  private quiet: boolean;
  constructor(quiet = false) {
    this.quiet = quiet;
  }
  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 200) this.outbox.shift();
    if (!this.quiet) console.log(`📧 (not sent: no RESEND_API_KEY) to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
  }
}

export class ResendMailer implements Mailer {
  private key: string;
  private from: string;
  constructor(key: string, from: string) {
    this.key = key;
    this.from = from;
  }
  async send(mail: Mail): Promise<void> {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!r.ok) console.error(`📧 Resend refused the email (${r.status}): ${await r.text()}`);
  }
}

export function makeMailer(): Mailer {
  return CONFIG.resendKey ? new ResendMailer(CONFIG.resendKey, CONFIG.mailFrom) : new LogMailer();
}
