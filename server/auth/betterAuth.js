import crypto from 'node:crypto';
import { betterAuth } from 'better-auth';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000)
});

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  advanced: {
    database: {
      generateId: 'uuid'
    }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
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
  trustedOrigins: [
    process.env.CORS_ORIGINS || 'http://localhost:3005',
    'http://localhost:3005',
    'http://localhost:3001'
  ]
});
