import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSessionClearCookie,
  createSessionSetCookie,
  readSessionCookie
} from '../../auth/httpCookies.js';

const secret = 'A'.repeat(43);

test('session cookie parsing selects only the validated opaque session value', () => {
  assert.equal(readSessionCookie(`other=value; cga_session=${secret}`, 'cga_session'), secret);
  assert.equal(readSessionCookie('cga_session=invalid%2Fvalue', 'cga_session'), null);
  assert.equal(readSessionCookie('cga_session=short', 'cga_session'), null);
  assert.equal(readSessionCookie('x'.repeat(9000), 'cga_session'), null);
});

test('session cookie serialization is HttpOnly, SameSite, and production-secure', () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const cookie = createSessionSetCookie({
    cookieName: 'cga_session',
    sessionSecret: secret,
    expiresAt,
    secure: true
  });
  assert.match(cookie, /^cga_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(createSessionClearCookie({ cookieName: 'cga_session', secure: false }), /Max-Age=0/);
});
