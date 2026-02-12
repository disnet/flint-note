import { getDb } from '../db.js';
import crypto from 'node:crypto';

/**
 * Check if a user is already in the allowed_users table.
 */
export function isUserAllowed(userDid: string): boolean {
  const db = getDb();
  const row = db.query('SELECT 1 FROM allowed_users WHERE user_did = ?').get(userDid);
  return !!row;
}

/**
 * Validate and redeem an invite code for a user.
 * Returns true if the code was valid and the user was added to allowed_users.
 */
export function redeemInviteCode(userDid: string, code: string): boolean {
  const db = getDb();

  const invite = db
    .query('SELECT code, max_uses, uses, expires_at FROM invite_codes WHERE code = ?')
    .get(code) as {
    code: string;
    max_uses: number;
    uses: number;
    expires_at: string | null;
  } | null;

  if (!invite) return false;

  // Check expiration
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return false;
  }

  // Check usage limit
  if (invite.uses >= invite.max_uses) {
    return false;
  }

  // Increment uses and add user atomically
  const transaction = db.transaction(() => {
    db.query('UPDATE invite_codes SET uses = uses + 1 WHERE code = ?').run(code);
    db.query(
      'INSERT OR IGNORE INTO allowed_users (user_did, invite_code_used) VALUES (?, ?)'
    ).run(userDid, code);
  });
  transaction();

  return true;
}

/**
 * Generate a new invite code and store it in the database.
 */
export function generateInviteCode(maxUses: number = 1, expiresAt?: string): string {
  const db = getDb();
  const code = crypto.randomBytes(8).toString('hex');

  db.query('INSERT INTO invite_codes (code, max_uses, expires_at) VALUES (?, ?, ?)').run(
    code,
    maxUses,
    expiresAt ?? null
  );

  return code;
}
