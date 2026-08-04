import { betterAuth } from 'better-auth';
import { serverConfig } from '../config.js';
import { createPostgresDatabase } from '../db/postgres.js';
import { hashPassword, verifyPassword } from './passwords.js';

/** @param {string} name */
const requireAuthEnvironment = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for Better Auth.`);
  return value;
};

if (serverConfig.persistenceMode !== 'postgres') {
  throw new Error('Better Auth requires PERSISTENCE_MODE=postgres.');
}

const secret = requireAuthEnvironment('BETTER_AUTH_SECRET');
if (secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be at least 32 characters long.');
}

const baseURL = requireAuthEnvironment('BETTER_AUTH_URL').replace(/\/$/, '');
const baseUrl = new URL(baseURL);
if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
  throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
}

const googleClientId = requireAuthEnvironment('GOOGLE_CLIENT_ID');
const googleClientSecret = requireAuthEnvironment('GOOGLE_CLIENT_SECRET');

// Better Auth and the rest of the API deliberately share this one pool. A
// second, independently configured pool previously meant OAuth verification
// state had a different failure/retry path than sessions and application data.
export const authDatabase = createPostgresDatabase({
  connectionString: serverConfig.database.url,
  max: serverConfig.database.poolMax,
  idleTimeoutMs: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMs: serverConfig.database.connectionTimeoutMs
});

export const auth = betterAuth({
  database: authDatabase.pool,
  secret,
  baseURL,
  advanced: {
    database: {
      generateId: 'uuid'
    },
    useSecureCookies: baseUrl.protocol === 'https:',
    defaultCookieAttributes: {
      httpOnly: true,
      path: '/',
      sameSite: 'lax'
    }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    // Retain existing credential-account access while Better Auth remains the
    // only endpoint/session authority. New passwords use this same modern
    // scrypt format, so no compatibility branch exists in request handlers.
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(password, hash)
    }
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      // Google supplies a verified email address. This safely links a Google
      // identity to a pre-existing credential account with the same email.
      requireLocalEmailVerified: false
    }
  },
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret
    }
  },
  user: {
    modelName: 'users',
    fields: {
      name: 'display_name',
      image: 'avatar_url',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
        required: false
      },
      username: {
        type: 'string',
        required: false
      },
      accountKind: {
        type: 'string',
        fieldName: 'account_kind',
        defaultValue: 'registered',
        required: false
      },
      provider: {
        type: 'string',
        defaultValue: 'credentials',
        required: false
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const baseName = (user.name || user.email.split('@')[0] || 'user')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .slice(0, 24);
          const suffix = Math.floor(1000 + Math.random() * 9000);
          return {
            data: {
              ...user,
              username: user.username || `${baseName}_${suffix}`
            }
          };
        }
      }
    }
  },
  // Host-only cookies intentionally have no Domain attribute. localhost:3001
  // and localhost:3005 are different origins but the same site, so Lax cookies
  // are sent to the API without making them available to another host.
  trustedOrigins: [...serverConfig.corsOrigins, baseUrl.origin]
});
