# Flint Sync Service Architecture

[← Back to Encryption & Key Management](./02-ENCRYPTION-KEY-MANAGEMENT.md) | [Next: Data Model →](./04-DATA-MODEL.md)

---

## Overview

The Flint Sync Service is a lightweight backend deployed as a Cloudflare Worker that provides identity verification, authorization, and resource management for encrypted note synchronization.

**Key Principle:** The service never sees vault encryption keys or plaintext note data. It only handles authorization and provides scoped access to R2 storage.

---

## Core Responsibilities

### 1. Identity Verification

- Verify AT Protocol DPoP tokens
- Validate user's DID from token claims
- Ensure token is properly bound to request
- Check token expiration and scope

### 2. Authorization

- Issue temporary, scoped R2 credentials per user
- Credentials limited to `/{did}/*` prefix only
- Automatic credential rotation (1-hour expiration)
- Enforce principle of least privilege

### 3. Resource Management

- Track storage usage per DID
- Enforce storage quotas (default 1GB)
- Rate limiting per DID
- Monitor for abuse patterns

### 4. Privacy Guarantees

- Never sees vault encryption keys
- Never sees plaintext note data
- Only handles authorization metadata
- Minimal logging (no content inspection)

---

## API Endpoints

### POST /credentials

Request scoped R2 credentials for authenticated user.

**Request:**
```typescript
interface CredentialsRequest {
  did: string;               // User's AT Protocol DID
  dpopToken: string;         // DPoP-bound access token from AT Protocol
}

// Headers
{
  "Content-Type": "application/json",
  "DPoP": "<dpop-proof-jwt>"
}
```

**Response:**
```typescript
interface CredentialsResponse {
  r2Credentials: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    bucketName: string;
    expiration: string;      // ISO 8601 timestamp
  };
  storageQuota: {
    used: number;            // Bytes used
    limit: number;           // Bytes allowed
  };
}
```

**Status Codes:**
- `200 OK` - Credentials issued successfully
- `401 Unauthorized` - Invalid or expired DPoP token
- `403 Forbidden` - Quota exceeded
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

### POST /email

Set or update user email address.

**Request:**
```typescript
interface EmailRequest {
  did: string;
  email: string;
  productUpdatesOptIn: boolean;
  dpopToken: string;
}

// Headers
{
  "Content-Type": "application/json",
  "DPoP": "<dpop-proof-jwt>"
}
```

**Response:**
```typescript
interface EmailResponse {
  success: boolean;
  email: string;
}
```

**Status Codes:**
- `200 OK` - Email set successfully
- `400 Bad Request` - Invalid email format
- `401 Unauthorized` - Invalid DPoP token
- `409 Conflict` - Email already associated with different DID

---

### GET /email/:did

Get user email address (requires valid DPoP token).

**Request:**
```typescript
// Headers
{
  "DPoP": "<dpop-proof-jwt>"
}
```

**Response:**
```typescript
interface GetEmailResponse {
  email: string | null;
  emailVerified: boolean;
  productUpdatesOptIn: boolean;
}
```

**Status Codes:**
- `200 OK` - Email information returned
- `401 Unauthorized` - Invalid DPoP token
- `404 Not Found` - No email set for this DID

---

### GET /quota/:did

Check storage quota for a DID (requires valid DPoP token).

**Request:**
```typescript
// Headers
{
  "DPoP": "<dpop-proof-jwt>"
}
```

**Response:**
```typescript
interface QuotaResponse {
  did: string;
  used: number;            // Bytes used
  limit: number;           // Bytes allowed (default 1GB)
  percentUsed: number;     // 0-100
}
```

**Status Codes:**
- `200 OK` - Quota information returned
- `401 Unauthorized` - Invalid DPoP token
- `403 Forbidden` - DID mismatch (token DID ≠ requested DID)

---

## Security Model

### DPoP Token Verification

```typescript
async function verifyATProtocolToken(
  dpopToken: string,
  did: string,
  request: Request
): Promise<boolean> {
  // 1. Parse JWT from DPoP header
  const dpopProof = request.headers.get('DPoP');
  if (!dpopProof) {
    throw new Error('Missing DPoP proof');
  }

  const jwt = parseJWT(dpopProof);

  // 2. Fetch DID document to get public key
  const didDocument = await fetchDIDDocument(did);
  const publicKey = didDocument.verificationMethod[0].publicKeyJwk;

  // 3. Verify JWT signature using public key
  const isValid = await verifyJWTSignature(jwt, publicKey);
  if (!isValid) {
    throw new Error('Invalid DPoP proof signature');
  }

  // 4. Check token expiration and audience claims
  const now = Math.floor(Date.now() / 1000);
  if (jwt.exp < now) {
    throw new Error('DPoP proof expired');
  }

  if (jwt.aud !== 'https://sync.flint.app') {
    throw new Error('Invalid audience claim');
  }

  // 5. Verify token is bound to request (DPoP proof)
  const requestHash = await hashRequest(request);
  if (jwt.htu !== request.url || jwt.htm !== request.method) {
    throw new Error('DPoP proof not bound to request');
  }

  // 6. Verify DID matches token subject
  if (jwt.sub !== did) {
    throw new Error('DID mismatch');
  }

  return true;
}
```

### R2 Credential Scoping

```typescript
async function generateScopedR2Credentials(
  did: string,
  env: Env
): Promise<R2Credentials> {
  // Use Cloudflare R2's temporary token API
  // Scope credentials to only allow access to /{did}/* prefix
  const token = await env.R2_BUCKET.createTemporaryAccessToken({
    prefix: `${did}/`,
    permissions: ['read', 'write', 'delete'],
    expiresIn: 3600 // 1 hour
  });

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: token.accessKeyId,
    secretAccessKey: token.secretAccessKey,
    bucketName: env.R2_BUCKET_NAME,
    sessionToken: token.sessionToken,
    expiration: new Date(Date.now() + 3600000).toISOString()
  };
}
```

### Storage Quota Enforcement

```typescript
async function checkStorageQuota(did: string, env: Env): Promise<QuotaInfo> {
  // Query usage from D1 or KV
  const usage = await env.QUOTA_DB.prepare(
    'SELECT used_bytes FROM quotas WHERE did = ?'
  ).bind(did).first<{ used_bytes: number }>();

  const used = usage?.used_bytes || 0;
  const limit = 1024 * 1024 * 1024; // 1GB default

  return {
    used,
    limit,
    percentUsed: (used / limit) * 100
  };
}

async function updateStorageUsage(did: string, bytesChanged: number, env: Env): Promise<void> {
  // Update usage in D1
  await env.QUOTA_DB.prepare(`
    INSERT INTO quotas (did, used_bytes, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(did) DO UPDATE SET
      used_bytes = used_bytes + excluded.used_bytes,
      updated_at = datetime('now')
  `).bind(did, bytesChanged).run();

  // Check if over quota
  const quota = await checkStorageQuota(did, env);
  if (quota.used > quota.limit) {
    throw new Error('Storage quota exceeded');
  }
}
```

---

## Implementation

### Cloudflare Worker

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, DPoP',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST /credentials - Issue scoped R2 credentials
      if (url.pathname === '/credentials' && request.method === 'POST') {
        const { did, dpopToken } = await request.json();

        // Verify AT Protocol DPoP token
        const verified = await verifyATProtocolToken(dpopToken, did, request);
        if (!verified) {
          return new Response('Unauthorized', {
            status: 401,
            headers: corsHeaders
          });
        }

        // Check storage quota
        const quota = await checkStorageQuota(did, env);
        if (quota.percentUsed >= 100) {
          return new Response('Storage quota exceeded', {
            status: 403,
            headers: corsHeaders
          });
        }

        // Generate scoped R2 credentials
        const credentials = await generateScopedR2Credentials(did, env);

        return new Response(JSON.stringify({
          r2Credentials: credentials,
          storageQuota: quota
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // POST /email - Set user email
      if (url.pathname === '/email' && request.method === 'POST') {
        const { did, email, productUpdatesOptIn, dpopToken } = await request.json();

        // Verify DPoP token
        const verified = await verifyATProtocolToken(dpopToken, did, request);
        if (!verified) {
          return new Response('Unauthorized', {
            status: 401,
            headers: corsHeaders
          });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return new Response('Invalid email format', {
            status: 400,
            headers: corsHeaders
          });
        }

        // Check if email already associated with different DID
        const existing = await env.QUOTA_DB.prepare(
          'SELECT did FROM user_emails WHERE email = ? AND did != ?'
        ).bind(email, did).first();

        if (existing) {
          return new Response('Email already associated with different account', {
            status: 409,
            headers: corsHeaders
          });
        }

        // Upsert email
        await env.QUOTA_DB.prepare(`
          INSERT INTO user_emails (did, email, product_updates_opt_in, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(did) DO UPDATE SET
            email = excluded.email,
            product_updates_opt_in = excluded.product_updates_opt_in,
            updated_at = datetime('now')
        `).bind(did, email, productUpdatesOptIn ? 1 : 0).run();

        return new Response(JSON.stringify({
          success: true,
          email
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // GET /email/:did - Get user email
      if (url.pathname.startsWith('/email/') && request.method === 'GET') {
        const did = url.pathname.replace('/email/', '');

        // Verify DPoP token
        const dpopToken = request.headers.get('DPoP');
        if (!dpopToken) {
          return new Response('Missing DPoP token', {
            status: 401,
            headers: corsHeaders
          });
        }

        const verified = await verifyATProtocolToken(dpopToken, did, request);
        if (!verified) {
          return new Response('Unauthorized', {
            status: 401,
            headers: corsHeaders
          });
        }

        const emailData = await env.QUOTA_DB.prepare(
          'SELECT email, email_verified, product_updates_opt_in FROM user_emails WHERE did = ?'
        ).bind(did).first<{
          email: string;
          email_verified: number;
          product_updates_opt_in: number;
        }>();

        if (!emailData) {
          return new Response('No email found', {
            status: 404,
            headers: corsHeaders
          });
        }

        return new Response(JSON.stringify({
          email: emailData.email,
          emailVerified: emailData.email_verified === 1,
          productUpdatesOptIn: emailData.product_updates_opt_in === 1
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // GET /quota/:did - Check storage quota
      if (url.pathname.startsWith('/quota/') && request.method === 'GET') {
        const did = url.pathname.replace('/quota/', '');

        // Verify DPoP token
        const dpopToken = request.headers.get('DPoP');
        if (!dpopToken) {
          return new Response('Missing DPoP token', {
            status: 401,
            headers: corsHeaders
          });
        }

        const verified = await verifyATProtocolToken(dpopToken, did, request);
        if (!verified) {
          return new Response('Unauthorized', {
            status: 401,
            headers: corsHeaders
          });
        }

        const quota = await checkStorageQuota(did, env);

        return new Response(JSON.stringify({
          did,
          ...quota
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      return new Response('Not found', {
        status: 404,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(error.message || 'Internal server error', {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

interface Env {
  R2_BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  QUOTA_DB: D1Database;
}
```

### Database Schema (Cloudflare D1)

```sql
-- User emails table
CREATE TABLE user_emails (
  did TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT 0,
  product_updates_opt_in BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_emails_email ON user_emails(email);
CREATE INDEX idx_user_emails_verified ON user_emails(email_verified);

-- Quotas table
CREATE TABLE quotas (
  did TEXT PRIMARY KEY,
  used_bytes INTEGER NOT NULL DEFAULT 0,
  limit_bytes INTEGER NOT NULL DEFAULT 1073741824, -- 1GB
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_quotas_updated ON quotas(updated_at);

-- Rate limiting table
CREATE TABLE rate_limits (
  did TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  PRIMARY KEY (did, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- Audit log (optional)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT -- JSON
);

CREATE INDEX idx_audit_did ON audit_log(did);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
```

---

## Deployment

### Infrastructure

- **Cloudflare Worker** (edge compute)
- **Cloudflare R2** (object storage)
- **Cloudflare D1** (quota tracking) or KV

### Environment Variables

```bash
# Production
CLOUDFLARE_ACCOUNT_ID=abc123xyz
R2_BUCKET_NAME=flint-notes-prod
AT_PROTOCOL_AUDIENCE=https://sync.flint.app

# Development
CLOUDFLARE_ACCOUNT_ID=dev123xyz
R2_BUCKET_NAME=flint-notes-dev
AT_PROTOCOL_AUDIENCE=https://sync-dev.flint.app
```

### Deployment Commands

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create flint-sync-quotas

# Deploy worker
wrangler deploy

# Tail logs
wrangler tail
```

---

## Cost Analysis

### Cloudflare Pricing

**Workers:**
- Free tier: 100,000 requests/day
- Paid: $5/month for 10M requests

**R2:**
- Storage: $0.015/GB/month
- Class A operations (write): $4.50/million
- Class B operations (read): $0.36/million
- Egress: Free

**D1:**
- Free tier: 5GB storage, 5M reads/day, 100K writes/day
- Paid: $0.75/GB/month + per-operation costs

### Example Cost (10,000 Users)

**Storage (avg 10MB/user = 100GB total):**
- 100GB × $0.015 = $1.50/month

**Operations (avg 100 syncs/user/month):**
- Writes: 1M × $4.50/M = $4.50/month
- Reads: 1M × $0.36/M = $0.36/month

**Workers:**
- Free tier sufficient

**D1:**
- Free tier sufficient

**Total: ~$6.36/month for 10,000 users**

---

## Scaling Considerations

### Horizontal Scaling

- Workers auto-scale globally
- No server management required
- Edge deployment reduces latency

### Rate Limiting

```typescript
async function checkRateLimit(did: string, endpoint: string, env: Env): Promise<boolean> {
  const window = Math.floor(Date.now() / 60000); // 1-minute windows
  const windowStart = new Date(window * 60000).toISOString();

  const result = await env.QUOTA_DB.prepare(`
    INSERT INTO rate_limits (did, endpoint, request_count, window_start)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(did, endpoint, window_start) DO UPDATE SET
      request_count = request_count + 1
    RETURNING request_count
  `).bind(did, endpoint, windowStart).first<{ request_count: number }>();

  const limit = 60; // 60 requests per minute
  return (result?.request_count || 0) <= limit;
}
```

### Monitoring

```typescript
// Log key metrics
interface Metrics {
  did: string;
  endpoint: string;
  duration: number;
  statusCode: number;
  bytesTransferred?: number;
}

async function logMetrics(metrics: Metrics, env: Env): Promise<void> {
  // Send to analytics service (e.g., Workers Analytics Engine)
  await env.ANALYTICS.writeDataPoint({
    blobs: [metrics.did, metrics.endpoint],
    doubles: [metrics.duration, metrics.statusCode],
    indexes: [metrics.did]
  });
}
```

---

## Security Best Practices

### 1. DPoP Token Validation

- Always verify token signature
- Check expiration timestamps
- Validate audience claims
- Verify request binding

### 2. Credential Scoping

- Limit credentials to DID-specific prefix
- Use shortest possible expiration (1 hour)
- Never reuse tokens across users
- Rotate regularly

### 3. Storage Isolation

- Enforce namespace isolation via R2 scoping
- Never allow cross-DID access
- Validate all path operations
- Audit access patterns

### 4. Rate Limiting

- Per-DID rate limits
- Per-endpoint limits
- Exponential backoff on violations
- Alert on suspicious patterns

### 5. Audit Logging

- Log all credential issuances
- Log quota changes
- Log failed authentication attempts
- Retain logs for security analysis

---

**Next:** [Data Model & Automerge Schema →](./04-DATA-MODEL.md)
