import { Router } from 'express';
import {
  registerVault,
  registerContentDoc,
  getUserVaults,
  getVaultContentDocs,
  userOwnsVault
} from './vault-access.js';
import type { AuthenticatedRequest } from '../auth/session.js';

const MAX_STRING_LENGTH = 512;
const MAX_BATCH_SIZE = 500;
const DOC_URL_PATTERN = /^automerge:[a-zA-Z0-9]+$/;
const VAULT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidDocUrl(url: string): boolean {
  return (
    typeof url === 'string' &&
    url.length <= MAX_STRING_LENGTH &&
    DOC_URL_PATTERN.test(url)
  );
}

function isValidVaultId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= MAX_STRING_LENGTH &&
    VAULT_ID_PATTERN.test(id)
  );
}

function isValidVaultName(name: unknown): boolean {
  return (
    name === undefined ||
    name === null ||
    (typeof name === 'string' && name.length <= MAX_STRING_LENGTH)
  );
}

export function createDocumentRoutes(): Router {
  const router = Router();

  // Register a vault for sync
  router.post('/vaults/register', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { vaultId, docUrl, vaultName } = req.body;
    if (!vaultId || !docUrl) {
      res.status(400).json({ error: 'vaultId and docUrl are required' });
      return;
    }
    if (!isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid vaultId format' });
      return;
    }
    if (!isValidDocUrl(docUrl)) {
      res.status(400).json({ error: 'Invalid docUrl format (must be automerge:...)' });
      return;
    }
    if (!isValidVaultName(vaultName)) {
      res.status(400).json({ error: 'Invalid vaultName' });
      return;
    }

    const registered = registerVault(userDid, vaultId, docUrl, vaultName);
    if (!registered) {
      res
        .status(403)
        .json({ error: 'This vault document is already owned by another user' });
      return;
    }
    res.json({ ok: true });
  });

  // Register a content document for sync
  router.post('/documents/register', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { docUrl, vaultId } = req.body;
    if (!docUrl || !vaultId) {
      res.status(400).json({ error: 'docUrl and vaultId are required' });
      return;
    }
    if (!isValidDocUrl(docUrl) || !isValidVaultId(vaultId)) {
      res.status(400).json({ error: 'Invalid docUrl or vaultId format' });
      return;
    }

    if (!userOwnsVault(userDid, vaultId)) {
      res.status(403).json({ error: 'You do not have access to this vault' });
      return;
    }

    registerContentDoc(userDid, vaultId, docUrl);
    res.json({ ok: true });
  });

  // Register multiple content documents at once
  router.post('/documents/register-batch', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { docs } = req.body as {
      docs: Array<{ docUrl: string; vaultId: string }>;
    };
    if (!Array.isArray(docs)) {
      res.status(400).json({ error: 'docs array is required' });
      return;
    }
    if (docs.length > MAX_BATCH_SIZE) {
      res.status(400).json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` });
      return;
    }

    // Validate all entries
    for (const doc of docs) {
      if (doc.docUrl && !isValidDocUrl(doc.docUrl)) {
        res.status(400).json({ error: `Invalid docUrl format: ${doc.docUrl}` });
        return;
      }
      if (doc.vaultId && !isValidVaultId(doc.vaultId)) {
        res.status(400).json({ error: `Invalid vaultId format: ${doc.vaultId}` });
        return;
      }
    }

    // Verify vault ownership for all referenced vaults
    const vaultIds = new Set(docs.map((d) => d.vaultId).filter(Boolean));
    for (const vaultId of vaultIds) {
      if (!userOwnsVault(userDid, vaultId)) {
        res.status(403).json({ error: `You do not have access to vault ${vaultId}` });
        return;
      }
    }

    let registered = 0;
    for (const { docUrl, vaultId } of docs) {
      if (docUrl && vaultId) {
        registerContentDoc(userDid, vaultId, docUrl);
        registered++;
      }
    }
    res.json({ ok: true, registered });
  });

  // Get user's vaults
  router.get('/vaults', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const vaults = getUserVaults(userDid);
    res.json({ vaults });
  });

  // Get content doc URLs for a vault
  router.get('/vaults/:vaultId/documents', (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userDid = authReq.userDid;
    if (!userDid) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const docUrls = getVaultContentDocs(userDid, req.params.vaultId);
    res.json({ docUrls });
  });

  return router;
}
