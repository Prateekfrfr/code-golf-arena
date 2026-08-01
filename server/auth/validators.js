import { ValidationError } from '../errors/index.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} .,'_-]+$/u;
const OPAQUE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** @param {unknown} payload @param {string} field @returns {unknown} */
const readOwnValue = (payload, field) => {
  if (!isRecord(payload)) {
    throw new ValidationError('Authentication input must be an object.', {
      code: 'INVALID_AUTH_INPUT'
    });
  }

  const descriptor = Object.getOwnPropertyDescriptor(payload, field);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new ValidationError(`${field} is required.`, { code: 'INVALID_AUTH_INPUT' });
  }
  return descriptor.value;
};

/** @param {unknown} value @param {string} field @param {number} max @returns {string} */
const requiredString = (value, field, max) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new ValidationError(`${field} is invalid.`, { code: 'INVALID_AUTH_INPUT' });
  }
  return value;
};

/** @param {unknown} value @returns {string} */
export const normalizeEmail = (value) => {
  const email = requiredString(value, 'email', 254).trim().toLowerCase();
  if (email.length < 3 || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('email is invalid.', { code: 'INVALID_AUTH_INPUT' });
  }
  return email;
};

/** @param {unknown} value @returns {string} */
export const validatePassword = (value) => {
  const password = requiredString(value, 'password', 1024);
  if (password.length < 12) {
    throw new ValidationError('password must contain at least 12 characters.', {
      code: 'WEAK_PASSWORD'
    });
  }
  return password;
};

/** @param {unknown} value @returns {string} */
export const validateDisplayName = (value) => {
  const displayName = requiredString(value, 'displayName', 80).trim();
  if (displayName.length < 2 || !DISPLAY_NAME_PATTERN.test(displayName)) {
    throw new ValidationError('displayName is invalid.', { code: 'INVALID_AUTH_INPUT' });
  }
  return displayName;
};

/** @param {unknown} value @param {string} field @returns {string} */
export const validateOpaqueIdentifier = (value, field) => {
  const identifier = requiredString(value, field, 128);
  if (!OPAQUE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new ValidationError(`${field} is invalid.`, { code: 'INVALID_AUTH_INPUT' });
  }
  return identifier;
};

/** @typedef {{ email: string, password: string, displayName: string, guestId: string | null }} RegistrationInput */

/** @param {unknown} payload @returns {RegistrationInput} */
export const validateRegistrationInput = (payload) => {
  const guestDescriptor =
    isRecord(payload) ? Object.getOwnPropertyDescriptor(payload, 'guestId') : undefined;
  const guestValue =
    guestDescriptor && Object.hasOwn(guestDescriptor, 'value') ? guestDescriptor.value : null;

  return {
    email: normalizeEmail(readOwnValue(payload, 'email')),
    password: validatePassword(readOwnValue(payload, 'password')),
    displayName: validateDisplayName(readOwnValue(payload, 'displayName')),
    guestId: guestValue === null || guestValue === undefined
      ? null
      : validateOpaqueIdentifier(guestValue, 'guestId')
  };
};

/** @typedef {{ email: string, password: string }} LoginInput */

/** @param {unknown} payload @returns {LoginInput} */
export const validateLoginInput = (payload) => ({
  email: normalizeEmail(readOwnValue(payload, 'email')),
  password: validatePassword(readOwnValue(payload, 'password'))
});

/** @typedef {{ displayName: string }} ProfileInput */

/** @param {unknown} payload @returns {ProfileInput} */
export const validateProfileInput = (payload) => ({
  displayName: validateDisplayName(readOwnValue(payload, 'displayName'))
});

/** @param {unknown} payload */
export const validateVerificationInput = (payload) => {
  const email = normalizeEmail(readOwnValue(payload, 'email'));
  const code = requiredString(readOwnValue(payload, 'code'), 'code', 16).trim();
  if (!/^\d{6}$/.test(code)) {
    throw new ValidationError('code is invalid.', { code: 'INVALID_AUTH_INPUT' });
  }
  return { email, code };
};
