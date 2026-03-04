import {
  NodeOAuthClient,
  type NodeSavedState,
  type NodeSavedSession,
  type NodeSavedStateStore,
  type NodeSavedSessionStore
} from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { getDb } from '../db.js';

let oauthClient: NodeOAuthClient;

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://sync.flintnote.com';
const PORT = parseInt(process.env.PORT || '3000', 10);

export function isLoopbackMode(): boolean {
  return (
    PUBLIC_URL.startsWith('http://localhost') || PUBLIC_URL.startsWith('http://127.0.0.1')
  );
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (oauthClient) return oauthClient;

  if (isLoopbackMode()) {
    const redirectUri = `http://127.0.0.1:${PORT}/auth/callback`;
    const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=atproto`;

    console.log('Using AT Protocol loopback client for local development');

    oauthClient = new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: 'Flint Notes (Dev)',
        client_uri: `http://localhost:${PORT}`,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'atproto',
        application_type: 'native'
      },

      stateStore: createStateStore(),
      sessionStore: createSessionStore()
    });
  } else {
    const privateKey = process.env.OAUTH_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('OAUTH_PRIVATE_KEY environment variable is required');
    }

    // Use fromPKCS8 with explicit algorithm since Bun resolves jose to its
    // browser/WebCrypto build which requires the alg parameter (fromImportable
    // passes an empty string which fails in the browser runtime)
    const keyset = await Promise.all([
      privateKey.trim().startsWith('-----')
        ? JoseKey.fromPKCS8(privateKey, 'ES256', 'flint-signing-key')
        : JoseKey.fromImportable(privateKey, 'flint-signing-key')
    ]);

    oauthClient = new NodeOAuthClient({
      clientMetadata: {
        client_id: `${PUBLIC_URL}/client-metadata.json`,
        client_name: 'Flint Notes',
        client_uri: PUBLIC_URL,
        redirect_uris: [`${PUBLIC_URL}/auth/callback`],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'ES256',
        scope: 'atproto',
        application_type: 'web',
        dpop_bound_access_tokens: true,
        jwks_uri: `${PUBLIC_URL}/jwks.json`
      },

      keyset,

      stateStore: createStateStore(),
      sessionStore: createSessionStore()
    });
  }

  return oauthClient;
}

function createStateStore(): NodeSavedStateStore {
  return {
    async set(key: string, state: NodeSavedState): Promise<void> {
      const db = getDb();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      db.query(
        `INSERT OR REPLACE INTO oauth_sessions (key, value, expires_at) VALUES (?, ?, ?)`
      ).run(`state:${key}`, JSON.stringify(state), expiresAt);
    },

    async get(key: string): Promise<NodeSavedState | undefined> {
      const db = getDb();
      const row = db
        .query(
          'SELECT value FROM oauth_sessions WHERE key = ? AND (expires_at IS NULL OR expires_at > datetime(?))'
        )
        .get(`state:${key}`, new Date().toISOString()) as { value: string } | null;
      return row ? JSON.parse(row.value) : undefined;
    },

    async del(key: string): Promise<void> {
      const db = getDb();
      db.query('DELETE FROM oauth_sessions WHERE key = ?').run(`state:${key}`);
    }
  };
}

function createSessionStore(): NodeSavedSessionStore {
  return {
    async set(sub: string, session: NodeSavedSession): Promise<void> {
      const db = getDb();
      db.query(`INSERT OR REPLACE INTO oauth_sessions (key, value) VALUES (?, ?)`).run(
        `session:${sub}`,
        JSON.stringify(session)
      );
    },

    async get(sub: string): Promise<NodeSavedSession | undefined> {
      const db = getDb();
      const row = db
        .query('SELECT value FROM oauth_sessions WHERE key = ?')
        .get(`session:${sub}`) as { value: string } | null;
      return row ? JSON.parse(row.value) : undefined;
    },

    async del(sub: string): Promise<void> {
      const db = getDb();
      db.query('DELETE FROM oauth_sessions WHERE key = ?').run(`session:${sub}`);
    }
  };
}

// Periodically clean expired OAuth state entries
export function cleanExpiredOAuthState(): void {
  const db = getDb();
  db.query(
    "DELETE FROM oauth_sessions WHERE key LIKE 'state:%' AND expires_at < datetime(?)"
  ).run(new Date().toISOString());
}
