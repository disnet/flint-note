/**
 * REST API routes for binary file upload/download.
 * Mounted at /api/files, behind requireAuth middleware.
 *
 * Files are content-addressed by SHA-256 hash for automatic deduplication.
 */

import { Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import type { AuthenticatedRequest } from '../auth/session.js';
import { getDb } from '../db.js';
import * as fileStorage from './file-storage.js';

const VALID_FILE_TYPES = ['pdf', 'epub', 'image', 'webpage'];
const VALID_EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;
const VALID_HASH_PATTERN = /^[a-f0-9]{8,128}$/;
const VAULT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const CONVERSATION_ID_PATTERN = /^conv-[a-z0-9]{8}$/;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_CONVERSATION_SIZE = 50 * 1024 * 1024; // 50MB

function isValidFileType(type: string): boolean {
  return VALID_FILE_TYPES.includes(type);
}

function isValidHash(hash: string): boolean {
  return typeof hash === 'string' && VALID_HASH_PATTERN.test(hash);
}

function isValidExtension(ext: string): boolean {
  return typeof ext === 'string' && VALID_EXTENSION_PATTERN.test(ext);
}

function isValidVaultId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 512 &&
    VAULT_ID_PATTERN.test(id)
  );
}

function isValidConversationId(id: string): boolean {
  return typeof id === 'string' && CONVERSATION_ID_PATTERN.test(id);
}

/**
 * Compute SHA-256 hash of a buffer
 */
function computeHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function createFileRoutes(): Router {
  const router = Router();

  // Raw body parser for upload routes only
  const rawBodyParser = express.raw({ limit: '50mb', type: 'application/octet-stream' });

  // --- Static path routes MUST come before parameterized routes ---
  // (Express matches in definition order, so /manifest/:vaultId must precede /:fileType/:hash)

  // GET /manifest/:vaultId — List all files for a vault
  router.get('/manifest/:vaultId', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { vaultId } = req.params;
    if (!isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid vault ID' });
      return;
    }

    try {
      const db = getDb();
      const files = db
        .query(
          `SELECT hash, file_type as fileType, extension, size_bytes as sizeBytes
           FROM file_metadata
           WHERE user_did = ? AND vault_id = ?`
        )
        .all(userDid, vaultId) as Array<{
        hash: string;
        fileType: string;
        extension: string;
        sizeBytes: number;
      }>;

      res.json({ files });
    } catch (error) {
      console.error('[FileRoutes] Manifest fetch failed:', error);
      res.status(500).json({ error: 'Failed to fetch manifest' });
    }
  });

  // PUT /webpage/:hash/metadata — Upload webpage metadata
  router.put(
    '/webpage/:hash/metadata',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      const userDid = authReq.userDid;
      if (!userDid) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { hash } = req.params;
      if (!isValidHash(hash)) {
        res.status(400).json({ error: 'Invalid hash' });
        return;
      }

      const metadata = req.body as Record<string, unknown>;
      if (!metadata || typeof metadata !== 'object') {
        res.status(400).json({ error: 'Invalid metadata body' });
        return;
      }

      // Verify user has access
      const db = getDb();
      const record = db
        .query(
          'SELECT 1 FROM file_metadata WHERE hash = ? AND file_type = ? AND user_did = ?'
        )
        .get(hash, 'webpage', userDid);

      if (!record) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      try {
        await fileStorage.storeMetadata(hash, metadata);
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error('[FileRoutes] Metadata upload failed:', error);
        res.status(500).json({ error: 'Metadata upload failed' });
      }
    }
  );

  // GET /webpage/:hash/metadata — Download webpage metadata
  router.get('/webpage/:hash/metadata', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { hash } = req.params;
    if (!isValidHash(hash)) {
      res.status(400).json({ error: 'Invalid hash' });
      return;
    }

    // Verify user has access
    const db = getDb();
    const record = db
      .query(
        'SELECT 1 FROM file_metadata WHERE hash = ? AND file_type = ? AND user_did = ?'
      )
      .get(hash, 'webpage', userDid);

    if (!record) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const metadata = await fileStorage.retrieveMetadata(hash);
      if (!metadata) {
        res.status(404).json({ error: 'Metadata not found' });
        return;
      }

      res.json(metadata);
    } catch (error) {
      console.error('[FileRoutes] Metadata download failed:', error);
      res.status(500).json({ error: 'Metadata download failed' });
    }
  });

  // --- Parameterized file routes ---

  // PUT /:fileType/:hash — Upload file
  router.put('/:fileType/:hash', rawBodyParser, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { fileType, hash } = req.params;
    const extension = req.query.extension as string;
    const vaultId = req.query.vaultId as string;

    // Validate params
    if (!isValidFileType(fileType)) {
      res.status(400).json({ error: 'Invalid file type' });
      return;
    }
    if (!isValidHash(hash)) {
      res.status(400).json({ error: 'Invalid hash' });
      return;
    }
    if (!extension || !isValidExtension(extension)) {
      res.status(400).json({ error: 'Missing or invalid extension query parameter' });
      return;
    }
    if (!vaultId || !isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Missing or invalid vaultId query parameter' });
      return;
    }

    // Get body as Buffer
    const body = req.body as Buffer;
    if (!body || body.length === 0) {
      res.status(400).json({ error: 'Empty body' });
      return;
    }
    if (body.length > MAX_FILE_SIZE) {
      res.status(413).json({ error: 'File too large (max 50MB)' });
      return;
    }

    // Validate hash matches content
    // Images use 8-char short hashes (prefix of SHA-256), so compare prefix only
    const computedHash = computeHash(body);
    const hashMatches =
      fileType === 'image' ? computedHash.startsWith(hash) : computedHash === hash;
    if (!hashMatches) {
      res.status(400).json({ error: 'Hash mismatch: body does not match provided hash' });
      return;
    }

    try {
      // Store file on disk
      await fileStorage.store(
        hash,
        fileType as 'pdf' | 'epub' | 'image' | 'webpage',
        extension,
        body
      );

      // Upsert metadata record
      const db = getDb();
      db.run(
        `INSERT INTO file_metadata (hash, file_type, extension, user_did, vault_id, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (hash, file_type, user_did) DO UPDATE SET
           extension = excluded.extension,
           vault_id = excluded.vault_id,
           size_bytes = excluded.size_bytes`,
        [hash, fileType, extension, userDid, vaultId, body.length]
      );

      res.status(200).json({ ok: true, hash, sizeBytes: body.length });
    } catch (error) {
      console.error('[FileRoutes] Upload failed:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // GET /:fileType/:hash — Download file
  router.get('/:fileType/:hash', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { fileType, hash } = req.params;
    const extension = req.query.extension as string;

    if (!isValidFileType(fileType)) {
      res.status(400).json({ error: 'Invalid file type' });
      return;
    }
    if (!isValidHash(hash)) {
      res.status(400).json({ error: 'Invalid hash' });
      return;
    }
    if (!extension || !isValidExtension(extension)) {
      res.status(400).json({ error: 'Missing or invalid extension query parameter' });
      return;
    }

    // Verify user has access (has a file_metadata record)
    const db = getDb();
    const record = db
      .query(
        'SELECT 1 FROM file_metadata WHERE hash = ? AND file_type = ? AND user_did = ?'
      )
      .get(hash, fileType, userDid);

    if (!record) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const data = await fileStorage.retrieve(
        hash,
        fileType as 'pdf' | 'epub' | 'image' | 'webpage',
        extension
      );

      if (!data) {
        res.status(404).json({ error: 'File not found on disk' });
        return;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', data.length.toString());
      res.setHeader('Cache-Control', 'private, immutable, max-age=31536000');
      res.send(data);
    } catch (error) {
      console.error('[FileRoutes] Download failed:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // --- Conversation routes ---
  // Manifest route MUST come before parameterized /:conversationId routes

  // GET /conversation/:vaultId/manifest — List conversations for a vault
  router.get('/conversation/:vaultId/manifest', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { vaultId } = req.params;
    if (!isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid vault ID' });
      return;
    }

    try {
      const db = getDb();
      const conversations = db
        .query(
          `SELECT conversation_id as conversationId, updated_at as updatedAt, size_bytes as sizeBytes
           FROM conversation_metadata
           WHERE user_did = ? AND vault_id = ?`
        )
        .all(userDid, vaultId) as Array<{
        conversationId: string;
        updatedAt: string;
        sizeBytes: number;
      }>;

      res.json({ conversations });
    } catch (error) {
      console.error('[FileRoutes] Conversation manifest failed:', error);
      res.status(500).json({ error: 'Failed to fetch manifest' });
    }
  });

  // PUT /conversation/:vaultId/:conversationId — Upload conversation JSON
  router.put(
    '/conversation/:vaultId/:conversationId',
    express.json({ limit: '50mb' }),
    async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      const userDid = authReq.userDid;
      if (!userDid) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { vaultId, conversationId } = req.params;

      if (!isValidVaultId(vaultId)) {
        res.status(400).json({ error: 'Invalid vault ID' });
        return;
      }
      if (!isValidConversationId(conversationId)) {
        res.status(400).json({ error: 'Invalid conversation ID' });
        return;
      }

      const body = JSON.stringify(req.body);
      const bodyBuffer = Buffer.from(body, 'utf-8');

      if (bodyBuffer.length > MAX_CONVERSATION_SIZE) {
        res.status(413).json({ error: 'Conversation too large (max 10MB)' });
        return;
      }

      try {
        await fileStorage.storeConversation(userDid, vaultId, conversationId, bodyBuffer);

        // Upsert metadata
        const db = getDb();
        const updatedAt = (req.body as Record<string, unknown>)?.updated as
          | string
          | undefined;
        db.run(
          `INSERT INTO conversation_metadata (conversation_id, user_did, vault_id, updated_at, size_bytes)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (conversation_id, user_did) DO UPDATE SET
             vault_id = excluded.vault_id,
             updated_at = excluded.updated_at,
             size_bytes = excluded.size_bytes`,
          [
            conversationId,
            userDid,
            vaultId,
            updatedAt || new Date().toISOString(),
            bodyBuffer.length
          ]
        );

        res.status(200).json({ ok: true, sizeBytes: bodyBuffer.length });
      } catch (error) {
        console.error('[FileRoutes] Conversation upload failed:', error);
        res.status(500).json({ error: 'Upload failed' });
      }
    }
  );

  // GET /conversation/:vaultId/:conversationId — Download conversation JSON
  router.get('/conversation/:vaultId/:conversationId', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { vaultId, conversationId } = req.params;

    if (!isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid vault ID' });
      return;
    }
    if (!isValidConversationId(conversationId)) {
      res.status(400).json({ error: 'Invalid conversation ID' });
      return;
    }

    // Verify user has access
    const db = getDb();
    const record = db
      .query(
        'SELECT 1 FROM conversation_metadata WHERE conversation_id = ? AND user_did = ? AND vault_id = ?'
      )
      .get(conversationId, userDid, vaultId);

    if (!record) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    try {
      const data = await fileStorage.retrieveConversation(
        userDid,
        vaultId,
        conversationId
      );
      if (!data) {
        res.status(404).json({ error: 'Conversation not found on disk' });
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Length', data.length.toString());
      res.send(data);
    } catch (error) {
      console.error('[FileRoutes] Conversation download failed:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // DELETE /conversation/:vaultId/:conversationId — Delete conversation
  router.delete('/conversation/:vaultId/:conversationId', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { vaultId, conversationId } = req.params;

    if (!isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid vault ID' });
      return;
    }
    if (!isValidConversationId(conversationId)) {
      res.status(400).json({ error: 'Invalid conversation ID' });
      return;
    }

    try {
      await fileStorage.deleteConversation(userDid, vaultId, conversationId);

      const db = getDb();
      db.run(
        'DELETE FROM conversation_metadata WHERE conversation_id = ? AND user_did = ?',
        [conversationId, userDid]
      );

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[FileRoutes] Conversation delete failed:', error);
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  // HEAD /:fileType/:hash — Check file existence
  router.head('/:fileType/:hash', async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).end();
      return;
    }

    const { fileType, hash } = req.params;
    const extension = req.query.extension as string;

    if (
      !isValidFileType(fileType) ||
      !isValidHash(hash) ||
      !extension ||
      !isValidExtension(extension)
    ) {
      res.status(400).end();
      return;
    }

    // Verify user has access (has a file_metadata record)
    const db = getDb();
    const record = db
      .query(
        'SELECT 1 FROM file_metadata WHERE hash = ? AND file_type = ? AND user_did = ?'
      )
      .get(hash, fileType, userDid);

    if (!record) {
      res.status(404).end();
      return;
    }

    const onDisk = await fileStorage.exists(
      hash,
      fileType as 'pdf' | 'epub' | 'image' | 'webpage',
      extension
    );

    if (onDisk) {
      res.status(200).end();
    } else {
      res.status(404).end();
    }
  });

  return router;
}
