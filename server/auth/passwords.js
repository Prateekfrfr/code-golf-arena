import crypto from 'node:crypto';

const SCRYPT = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024
});

/** @param {string} password @param {Buffer} salt */
const derive = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, SCRYPT.keyLength, SCRYPT, (error, key) => {
    if (error) reject(error);
    else resolve(Buffer.from(key));
  });
});

/** @param {string} password */
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
};

/** @param {string} password @param {unknown} encoded */
export const verifyPassword = async (password, encoded) => {
  if (typeof encoded !== 'string') return false;
  const [version, cost, blockSize, parallelization, saltText, keyText] = encoded.split('$');
  if (version !== 'scrypt' || cost !== String(SCRYPT.N) || blockSize !== String(SCRYPT.r) || parallelization !== String(SCRYPT.p)) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    if (salt.length < 16 || salt.length > 64 || expected.length !== SCRYPT.keyLength) return false;
    return crypto.timingSafeEqual(await derive(password, salt), expected);
  } catch {
    return false;
  }
};
