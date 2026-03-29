import * as jose from 'jose';
import { getDb } from '../db.js';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

let jwtSecret: Uint8Array;

function getJwtSecret(): Uint8Array {
  if (!jwtSecret) {
    let secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      secret = crypto.randomUUID() + crypto.randomUUID();
      console.warn(
        'WARNING: JWT_SECRET not set — using a random secret. Sessions will not survive server restarts.'
      );
    }
    jwtSecret = new TextEncoder().encode(secret);
  }
  return jwtSecret;
}

export interface SessionPayload {
  sub: string; // user DID
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  userDid?: string;
  sessionId?: string;
}

export async function createSessionToken(
  userDid: string
): Promise<{ token: string; sessionId: string }> {
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  db.query(
    'INSERT INTO sessions (session_id, user_did, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, userDid, now.toISOString(), expiresAt.toISOString());

  const token = await new jose.SignJWT({
    sub: userDid,
    sessionId
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());

  return { token, sessionId };
}

/**
 * @deprecated Use verifySessionTokenAsync instead. This sync version does NOT verify
 * the JWT signature — it only decodes. Kept temporarily for reference but should not be used.
 */
// Removed: verifySessionToken (sync) — used jose.decodeJwt() which does NOT verify signatures.

export async function verifySessionTokenAsync(
  token: string
): Promise<{ userDid: string; sessionId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    if (!payload.sub || !payload.sessionId) return null;

    // Verify session exists in DB
    const db = getDb();
    const session = db
      .query(
        'SELECT user_did FROM sessions WHERE session_id = ? AND expires_at > datetime(?)'
      )
      .get(payload.sessionId as string, new Date().toISOString()) as
      | { user_did: string }
      | undefined;

    if (!session) return null;

    return {
      userDid: payload.sub,
      sessionId: payload.sessionId as string
    };
  } catch {
    return null;
  }
}

// Max age for token refresh — if the token is older than this, require re-login
const MAX_REFRESH_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Verify a session token for refresh purposes.
 * Accepts expired JWTs (up to 30 days old) as long as the signature is valid.
 * Does NOT require the DB session to still exist (it may have been cleaned up).
 */
export async function verifySessionForRefresh(
  token: string
): Promise<{ userDid: string; sessionId: string } | null> {
  try {
    // Try normal verification first
    const { payload } = await jose.jwtVerify(token, getJwtSecret());
    if (!payload.sub || !payload.sessionId) return null;
    return { userDid: payload.sub, sessionId: payload.sessionId as string };
  } catch (err) {
    // If the token is expired but signature is valid, jose throws JWTExpired
    // which still carries the verified payload
    if (err instanceof jose.errors.JWTExpired) {
      const payload = err.payload;
      if (!payload.sub || !payload.sessionId) return null;

      // Reject tokens that are too old (>30 days)
      const iat = payload.iat;
      if (iat && Date.now() / 1000 - iat > MAX_REFRESH_AGE_MS / 1000) {
        return null;
      }

      return { userDid: payload.sub, sessionId: payload.sessionId as string };
    }
    // Any other error (bad signature, malformed token) — reject
    return null;
  }
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.query('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
}

export function cleanExpiredSessions(): void {
  const db = getDb();
  db.query('DELETE FROM sessions WHERE expires_at < datetime(?)').run(
    new Date().toISOString()
  );
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie('flint_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24h in ms
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('flint_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  });
}

/**
 * Parse cookies from a raw Cookie header string.
 * Used for WebSocket upgrade requests where cookie-parser middleware isn't available.
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}
