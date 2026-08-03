import { createRequire } from 'node:module';
import { AppError } from '../errors/index.js';

const nodemailer = createRequire(import.meta.url)('nodemailer');

/** @param {{ configured: boolean, host: string, port: number, secure: boolean, user: string, password: string, from: string, appUrl: string }} config */
export const createVerificationMailer = (config) => {
  if (!config.configured) return null;
  /** @type {unknown} */
  let verificationError = null;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: config.user, pass: config.password }
  });

  return Object.freeze({
    async verify() {
      try {
        await transporter.verify();
        verificationError = null;
      } catch (error) {
        verificationError = error;
        throw error;
      }
    },
    /** @param {{ email: string, code: string }} input */
    async sendVerificationCode({ email, code }) {
      if (verificationError) {
        throw new AppError('Email delivery is unavailable because SMTP verification failed. Check MAIL_USER and the Gmail App Password, then retry.', {
          code: 'SMTP_UNAVAILABLE', statusCode: 503, expose: true, cause: verificationError
        });
      }
      try {
        await transporter.sendMail({
          from: config.from,
          to: email,
          subject: 'Verify your Code Golf Arena account',
          text: `Your Code Golf Arena verification code is ${code}. It expires in 10 minutes. If you did not create an account, you can ignore this email.`,
          html: `<p>Your Code Golf Arena verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you did not create an account, you can ignore this email.</p>`
        });
      } catch (error) {
        const authFailure = error !== null
          && typeof error === 'object'
          && 'code' in error
          && error.code === 'EAUTH';
        throw new AppError(authFailure
          ? 'SMTP authentication failed. Check MAIL_USER and the Gmail App Password.'
          : 'Unable to send the verification email. Please try again later.', {
          code: 'EMAIL_DELIVERY_FAILED', statusCode: 503, expose: true, cause: error
        });
      }
    }
  });
};
