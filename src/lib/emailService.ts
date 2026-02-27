/**
 * Email Service — Send OTP emails via EmailJS
 *
 * EmailJS is a client-side email service (no backend needed).
 * Free tier: 200 emails/month — plenty for password resets.
 *
 * Setup required:
 *   1. Create account at https://www.emailjs.com
 *   2. Add an email service (e.g. Gmail, Outlook)
 *   3. Create an email template with variables:
 *        {{to_email}}, {{otp_code}}, {{app_name}}
 *   4. Copy Service ID, Template ID, Public Key into Settings → Profile
 */

import emailjs from '@emailjs/browser';
import { logger } from './logger';

// ─── Config keys in localStorage ─────────────────────────────

const EMAILJS_CONFIG_KEY = 'emailjs_config';

export interface EmailJSConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
}

export function getEmailJSConfig(): EmailJSConfig | null {
  try {
    const raw = localStorage.getItem(EMAILJS_CONFIG_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw) as EmailJSConfig;
    if (!config.serviceId || !config.templateId || !config.publicKey) return null;
    return config;
  } catch {
    return null;
  }
}

export function saveEmailJSConfig(config: EmailJSConfig): void {
  localStorage.setItem(EMAILJS_CONFIG_KEY, JSON.stringify(config));
}

export function isEmailConfigured(): boolean {
  return getEmailJSConfig() !== null;
}

// ─── Send OTP email ──────────────────────────────────────────

export async function sendOTPEmail(
  toEmail: string,
  otpCode: string,
): Promise<{ error: string | null }> {
  const config = getEmailJSConfig();
  if (!config) {
    return { error: 'Email service not configured. Set up EmailJS in Settings → Profile.' };
  }

  try {
    await emailjs.send(
      config.serviceId,
      config.templateId,
      {
        to_email: toEmail,
        otp_code: otpCode,
        app_name: 'AnikChat',
      },
      config.publicKey,
    );

    return { error: null };
  } catch (err) {
    logger.error('EmailJS send failed', err);
    return { error: 'Failed to send email. Check your EmailJS configuration.' };
  }
}
