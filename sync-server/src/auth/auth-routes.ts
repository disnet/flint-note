import { Router } from 'express';
import { getOAuthClient } from './atproto-oauth.js';
import {
  createSessionToken,
  verifySessionTokenAsync,
  verifySessionForRefresh,
  deleteSession,
  setSessionCookie,
  clearSessionCookie
} from './session.js';
import { isUserAllowed, redeemInviteCode } from './invite-codes.js';

const APP_URL = process.env.APP_URL || 'https://app.flintnote.com';

const ALLOWED_REDIRECT_ORIGINS = new Set([
  'https://app.flintnote.com',
  'http://localhost:5173'
]);
const ALLOWED_REDIRECT_PROTOCOLS = new Set(['flint:']);

function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (ALLOWED_REDIRECT_PROTOCOLS.has(parsed.protocol)) return true;
    return ALLOWED_REDIRECT_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

export function createAuthRoutes(): Router {
  const router = Router();

  // Initiate Bluesky OAuth login
  router.get('/login', async (req, res) => {
    try {
      const handle = req.query.handle as string;
      if (!handle) {
        res.status(400).json({ error: 'handle query parameter is required' });
        return;
      }

      const rawReturnTo = req.query.returnTo as string | undefined;
      const returnTo =
        rawReturnTo && isAllowedRedirect(rawReturnTo) ? rawReturnTo : APP_URL;

      const client = await getOAuthClient();
      const url = await client.authorize(handle, {
        state: JSON.stringify({ returnTo })
      });

      res.redirect(url.toString());
    } catch (error) {
      console.error('OAuth login error:', error);
      res.status(500).json({ error: 'Failed to initiate login' });
    }
  });

  // OAuth callback from Bluesky
  router.get('/callback', async (req, res) => {
    try {
      const client = await getOAuthClient();
      const params = new URLSearchParams(req.url.split('?')[1]);
      const { session, state } = await client.callback(params);

      const userDid = session.did;

      // Parse the return URL from state
      let returnTo = APP_URL;
      if (state) {
        try {
          const parsed = JSON.parse(state);
          if (parsed.returnTo && isAllowedRedirect(parsed.returnTo)) {
            returnTo = parsed.returnTo;
          }
        } catch {
          // Use defaults
        }
      }

      // Always create session and set cookie (even if user needs invite code)
      const { token } = await createSessionToken(userDid);
      setSessionCookie(res, token);

      // Check if user is allowed
      const allowed = isUserAllowed(userDid);

      // Determine redirect target
      const returnUrl = new URL(returnTo);

      // Check if it's an Electron deep link
      if (returnUrl.protocol === 'flint:') {
        returnUrl.searchParams.set('did', userDid);
        if (!allowed) {
          returnUrl.searchParams.set('error', 'invite_required');
        }
        res.redirect(returnUrl.toString());
        return;
      }

      // Web app redirect
      const callbackUrl = new URL('/auth/callback', returnTo);
      callbackUrl.searchParams.set('did', userDid);
      if (!allowed) {
        callbackUrl.searchParams.set('error', 'invite_required');
      }
      res.redirect(callbackUrl.toString());
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Check current session
  router.get('/session', async (req, res) => {
    const token = req.cookies?.flint_session;
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const session = await verifySessionTokenAsync(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    res.json({
      userDid: session.userDid
    });
  });

  // Refresh session token
  // Accepts expired tokens (up to 30 days) so clients that haven't
  // connected in a while can still refresh without re-authenticating.
  router.post('/refresh', async (req, res) => {
    const oldToken = req.cookies?.flint_session;
    if (!oldToken) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const oldSession = await verifySessionForRefresh(oldToken);
    if (!oldSession) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // Delete old session (if it still exists) and create new one
    deleteSession(oldSession.sessionId);
    const { token } = await createSessionToken(oldSession.userDid);

    setSessionCookie(res, token);
    res.json({ userDid: oldSession.userDid });
  });

  // Redeem an invite code (requires valid session)
  router.post('/redeem-invite', async (req, res) => {
    const token = req.cookies?.flint_session;
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = await verifySessionTokenAsync(token);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    const { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    if (isUserAllowed(session.userDid)) {
      // Already allowed, no need for invite
      res.json({ ok: true });
      return;
    }

    const redeemed = redeemInviteCode(session.userDid, code);
    if (!redeemed) {
      res.status(400).json({ error: 'Invalid or expired invite code' });
      return;
    }

    res.json({ ok: true });
  });

  // Logout
  router.post('/logout', async (req, res) => {
    const token = req.cookies?.flint_session;
    if (token) {
      const session = await verifySessionTokenAsync(token);
      if (session) {
        deleteSession(session.sessionId);
      }
    }

    clearSessionCookie(res);
    res.json({ ok: true });
  });

  return router;
}
