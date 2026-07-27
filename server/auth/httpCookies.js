const MAX_COOKIE_HEADER_BYTES = 8 * 1024;
const COOKIE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const SESSION_VALUE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** @param {unknown} cookieName */
const assertCookieName = (cookieName) => {
  if (typeof cookieName !== 'string' || !COOKIE_NAME_PATTERN.test(cookieName)) {
    throw new TypeError('Cookie name is invalid.');
  }
};

/**
 * Parses only the one cookie we own. No URI decoding is necessary because
 * opaque session secrets are base64url; avoiding it also prevents malformed
 * percent escapes from changing authentication behavior.
 * @param {unknown} header
 * @param {string} cookieName
 */
export const readSessionCookie = (header, cookieName) => {
  assertCookieName(cookieName);
  if (typeof header !== 'string' || Buffer.byteLength(header, 'utf8') > MAX_COOKIE_HEADER_BYTES) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    return SESSION_VALUE_PATTERN.test(value) ? value : null;
  }
  return null;
};

/**
 * @param {{ cookieName: string, sessionSecret: string, expiresAt: Date, secure: boolean }} options
 */
export const createSessionSetCookie = ({ cookieName, sessionSecret, expiresAt, secure }) => {
  assertCookieName(cookieName);
  if (typeof sessionSecret !== 'string' || !SESSION_VALUE_PATTERN.test(sessionSecret)) {
    throw new TypeError('Session cookie value is invalid.');
  }
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new TypeError('Session expiry is invalid.');
  }
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  return [
    `${cookieName}=${sessionSecret}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
    ...(secure ? ['Secure'] : [])
  ].join('; ');
};

/** @param {{ cookieName: string, secure: boolean }} options */
export const createSessionClearCookie = ({ cookieName, secure }) => {
  assertCookieName(cookieName);
  return [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
};
