import crypto from 'node:crypto';

const HASH_VERSION = 'scrypt';
const SCRYPT_PARAMETERS = Object.freeze({
  cost: 16_384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
  maxMemory: 64 * 1024 * 1024
});
const SESSION_SECRET_BYTES = 32;

/** @typedef {{ cost: number, blockSize: number, parallelization: number, keyLength: number, maxMemory: number }} ScryptParameters */

/** @param {string} password @param {Buffer} salt @param {ScryptParameters} parameters @returns {Promise<Buffer>} */
const derivePasswordKey = (password, salt, parameters) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: parameters.maxMemory
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Buffer.from(derivedKey));
      }
    );
  });

/** @param {unknown} encoded @returns {{ salt: Buffer, key: Buffer, parameters: ScryptParameters } | null} */
const parsePasswordHash = (encoded) => {
  if (typeof encoded !== 'string') return null;
  const [version, cost, blockSize, parallelization, saltText, keyText] = encoded.split('$');
  if (
    version !== HASH_VERSION ||
    !/^[1-9]\d{0,6}$/.test(cost ?? '') ||
    !/^[1-9]\d{0,4}$/.test(blockSize ?? '') ||
    !/^[1-9]\d{0,3}$/.test(parallelization ?? '') ||
    !saltText ||
    !keyText
  ) return null;

  const parameters = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    keyLength: SCRYPT_PARAMETERS.keyLength,
    maxMemory: SCRYPT_PARAMETERS.maxMemory
  };
  if (
    !Number.isSafeInteger(parameters.cost) ||
    !Number.isSafeInteger(parameters.blockSize) ||
    !Number.isSafeInteger(parameters.parallelization) ||
    parameters.cost > 1_048_576 ||
    parameters.blockSize > 1_024 ||
    parameters.parallelization > 64
  ) return null;

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const key = Buffer.from(keyText, 'base64url');
    if (salt.length < 16 || salt.length > 64 || key.length !== parameters.keyLength) return null;
    return { salt, key, parameters };
  } catch {
    return null;
  }
};

/** @param {string} password @returns {Promise<string>} */
export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await derivePasswordKey(password, salt, SCRYPT_PARAMETERS);
  return [
    HASH_VERSION,
    SCRYPT_PARAMETERS.cost,
    SCRYPT_PARAMETERS.blockSize,
    SCRYPT_PARAMETERS.parallelization,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join('$');
};

/** @param {string} password @param {unknown} encodedHash @returns {Promise<boolean>} */
export const verifyPassword = async (password, encodedHash) => {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  try {
    const derived = await derivePasswordKey(password, parsed.salt, parsed.parameters);
    return crypto.timingSafeEqual(derived, parsed.key);
  } catch {
    return false;
  }
};

/** @param {string} secret @returns {string} */
export const digestSessionSecret = (secret) =>
  crypto.createHash('sha256').update(secret, 'utf8').digest('hex');

/**
 * @param {number} [ttlMs]
 * @param {() => number} [now]
 * @returns {{ secret: string, secretDigest: string, expiresAt: Date }}
 */
export const createOpaqueSession = (ttlMs = 1000 * 60 * 60 * 24 * 30, now = Date.now) => {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 1000 * 60 * 60 * 24 * 90) {
    throw new RangeError('Session TTL must be between one minute and ninety days.');
  }
  const issuedAt = now();
  if (!Number.isSafeInteger(issuedAt)) throw new RangeError('Session clock must return milliseconds.');
  const secret = crypto.randomBytes(SESSION_SECRET_BYTES).toString('base64url');
  return {
    secret,
    secretDigest: digestSessionSecret(secret),
    expiresAt: new Date(issuedAt + ttlMs)
  };
};
