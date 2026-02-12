import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { createAuthRoutes } from './auth/auth-routes.js';
import { createDocumentRoutes } from './sync/document-registration.js';
import { initSyncServer } from './sync/sync-server.js';
import {
  verifySessionTokenAsync,
  cleanExpiredSessions,
  type AuthenticatedRequest
} from './auth/session.js';
import {
  getOAuthClient,
  cleanExpiredOAuthState,
  isLoopbackMode
} from './auth/atproto-oauth.js';
import { getDb } from './db.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://sync.flintnote.com';

const ALLOWED_ORIGINS = new Set([
  'https://app.flintnote.com',
  'http://localhost:5173' // dev
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Electron uses file:// or app:// origins
  if (origin === 'file://' || origin.startsWith('file://')) return true;
  if (origin === 'app://' || origin.startsWith('app://')) return true;
  return false;
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// CORS with origin allowlist
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Client metadata and JWKS endpoints (not needed in loopback mode)
if (!isLoopbackMode()) {
  app.get('/client-metadata.json', async (_req, res) => {
    res.json({
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
    });
  });

  app.get('/jwks.json', async (_req, res) => {
    try {
      const client = await getOAuthClient();
      const jwks = client.jwks;
      res.json(jwks);
    } catch (error) {
      console.error('Failed to serve JWKS:', error);
      res.status(500).json({ error: 'Failed to load JWKS' });
    }
  });
}

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute for API endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

// Auth routes (public, rate limited)
app.use('/auth', authLimiter, createAuthRoutes());

// Auth middleware for API routes
const requireAuth: express.RequestHandler = async (req, res, next) => {
  const token = req.cookies?.flint_session;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = await verifySessionTokenAsync(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as AuthenticatedRequest).userDid = session.userDid;
  (req as AuthenticatedRequest).sessionId = session.sessionId;
  next();
};

// Protected API routes (rate limited)
app.use('/api', apiLimiter, requireAuth, createDocumentRoutes());

// Create HTTP server
const server = createServer(app);

// Initialize Automerge sync server (handles WebSocket upgrades)
initSyncServer(server);

// Initialize database
getDb();

// Periodic cleanup
setInterval(
  () => {
    cleanExpiredSessions();
    cleanExpiredOAuthState();
  },
  60 * 60 * 1000 // Every hour
);

server.listen(PORT, () => {
  console.log(`Flint sync server listening on port ${PORT}`);
  console.log(`Public URL: ${PUBLIC_URL}`);
  if (isLoopbackMode()) {
    console.log('Running in loopback (local dev) mode — no OAUTH_PRIVATE_KEY needed');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
