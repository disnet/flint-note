/**
 * Content URL conflict resolution for daily notes.
 *
 * When two devices are offline and both create a daily note for the same date,
 * each creates a separate NoteContentDocument with a different Automerge URL.
 * On sync, Automerge picks one URL via LWW (last-writer-wins), orphaning the
 * other content document and silently losing its content.
 *
 * This module detects such conflicts via Automerge.getConflicts() and merges
 * the losing content into the winning document.
 */

import * as Automerge from '@automerge/automerge';
import type { DocHandle, Repo, AutomergeUrl } from '@automerge/automerge-repo';
import type { NotesDocument, NoteContentDocument } from './types';
import { removeFromContentCache, signalContentDocChanged } from './content-docs.svelte';

const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 3000;

// Pending conflict resolutions that need retry (losing doc not yet synced)
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const pendingConflictResolutions = new Map<
  string,
  { losingUrls: string[]; retryCount: number }
>();
let retryTimerId: ReturnType<typeof setTimeout> | null = null;

/**
 * Start the retry loop for pending conflict resolutions.
 */
function startRetryLoop(
  docHandle: DocHandle<NotesDocument>,
  repo: Repo,
  vaultId: string
): void {
  if (retryTimerId !== null) return;
  if (pendingConflictResolutions.size === 0) return;

  retryTimerId = setTimeout(async () => {
    retryTimerId = null;

    const resolved: string[] = [];
    for (const [noteId, pending] of pendingConflictResolutions) {
      const success = await resolveConflictForNote(
        docHandle,
        repo,
        vaultId,
        noteId,
        pending.losingUrls
      );

      if (success) {
        resolved.push(noteId);
      } else {
        pending.retryCount++;
        if (pending.retryCount >= MAX_RETRIES) {
          console.warn(
            `[ConflictResolver] Giving up on conflict resolution for ${noteId} after ${MAX_RETRIES} retries`
          );
          resolved.push(noteId);
        }
      }
    }

    for (const noteId of resolved) {
      pendingConflictResolutions.delete(noteId);
    }

    if (pendingConflictResolutions.size > 0) {
      startRetryLoop(docHandle, repo, vaultId);
    }
  }, RETRY_INTERVAL_MS);
}

/**
 * Try to load a content document handle, returning null if unavailable.
 */
async function tryLoadContentHandle(
  repo: Repo,
  url: string
): Promise<DocHandle<NoteContentDocument> | null> {
  try {
    const handle = await repo.find<NoteContentDocument>(url as AutomergeUrl);
    await handle.whenReady();
    if (handle.isReady()) {
      return handle;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the text content from a content document handle.
 */
function getContent(handle: DocHandle<NoteContentDocument>): string {
  const doc = handle.doc();
  return doc?.content ?? '';
}

/**
 * Attempt to resolve a content URL conflict for a single note.
 * Returns true if resolved (or no merge needed), false if losing docs aren't available yet.
 */
async function resolveConflictForNote(
  docHandle: DocHandle<NotesDocument>,
  repo: Repo,
  _vaultId: string,
  noteId: string,
  losingUrls: string[]
): Promise<boolean> {
  const doc = docHandle.doc();
  if (!doc) return false;

  const winningUrl = doc.contentUrls?.[noteId];
  if (!winningUrl) return true; // No content URL at all, nothing to do

  // Check if already resolved
  const resolved = doc.resolvedContentConflicts?.[noteId];
  if (resolved) {
    const allResolved = losingUrls.every((url) => resolved.mergedUrls.includes(url));
    if (allResolved) return true;
  }

  // Load winning content handle
  const winningHandle = await tryLoadContentHandle(repo, winningUrl);
  if (!winningHandle) return false;

  // Try to load all losing content handles
  const mergedUrls: string[] = [];
  let allAvailable = true;

  for (const losingUrl of losingUrls) {
    // Skip if this URL was already merged
    if (resolved?.mergedUrls.includes(losingUrl)) {
      mergedUrls.push(losingUrl);
      continue;
    }

    const losingHandle = await tryLoadContentHandle(repo, losingUrl);
    if (!losingHandle) {
      allAvailable = false;
      continue;
    }

    const losingContent = getContent(losingHandle);

    // Skip if losing content is empty
    if (!losingContent.trim()) {
      mergedUrls.push(losingUrl);
      continue;
    }

    // Skip if winning content already contains losing content (double-merge prevention)
    const currentWinning = getContent(winningHandle);
    if (currentWinning.includes(losingContent.trim())) {
      mergedUrls.push(losingUrl);
      continue;
    }

    // Skip if content is identical
    if (currentWinning.trim() === losingContent.trim()) {
      mergedUrls.push(losingUrl);
      continue;
    }

    // Merge: append losing content to winning doc
    const separator = currentWinning.trim() ? '\n\n---\n\n' : '';
    const mergedContent = currentWinning + separator + losingContent;

    winningHandle.change((contentDoc) => {
      Automerge.updateText(contentDoc, ['content'], mergedContent);
    });

    console.log(
      `[ConflictResolver] Merged content from ${losingUrl} into ${winningUrl} for note ${noteId}`
    );
    mergedUrls.push(losingUrl);
  }

  if (mergedUrls.length > 0) {
    // Record resolution for idempotency
    docHandle.change((d) => {
      if (!d.resolvedContentConflicts) {
        d.resolvedContentConflicts = {};
      }
      const existing = d.resolvedContentConflicts[noteId];
      if (existing) {
        // Append newly merged URLs
        for (const url of mergedUrls) {
          if (!existing.mergedUrls.includes(url)) {
            existing.mergedUrls.push(url);
          }
        }
        existing.resolvedAt = new Date().toISOString();
      } else {
        d.resolvedContentConflicts[noteId] = {
          mergedUrls: [...mergedUrls],
          resolvedAt: new Date().toISOString()
        };
      }
    });

    // Invalidate cached handle and signal editor to reload with merged content
    removeFromContentCache(noteId);
    signalContentDocChanged(noteId);
  }

  return allAvailable;
}

/**
 * Check and resolve content URL conflicts for specific daily note IDs.
 * Called when contentUrls changes (via patches) or on startup.
 */
export async function checkAndResolveContentUrlConflicts(
  docHandle: DocHandle<NotesDocument>,
  repo: Repo,
  vaultId: string | null,
  noteIds?: string[]
): Promise<void> {
  if (!vaultId) return;

  const doc = docHandle.doc();
  if (!doc?.contentUrls) return;

  // Determine which note IDs to check
  const idsToCheck =
    noteIds ?? Object.keys(doc.contentUrls).filter((id) => id.startsWith('daily-'));

  for (const noteId of idsToCheck) {
    if (!noteId.startsWith('daily-')) continue;

    // Get conflicts for this contentUrl entry
    const conflicts = Automerge.getConflicts(doc.contentUrls, noteId);
    if (!conflicts) continue;

    const winningUrl = doc.contentUrls[noteId];
    const losingUrls = Object.values(conflicts).filter(
      (url): url is string => typeof url === 'string' && url !== winningUrl
    );

    if (losingUrls.length === 0) continue;

    // Check if already fully resolved
    const resolved = doc.resolvedContentConflicts?.[noteId];
    if (resolved) {
      const allResolved = losingUrls.every((url) => resolved.mergedUrls.includes(url));
      if (allResolved) {
        // Still invalidate cache and signal so this device picks up the winning handle
        removeFromContentCache(noteId);
        signalContentDocChanged(noteId);
        continue;
      }
    }

    console.log(
      `[ConflictResolver] Detected content URL conflict for ${noteId}: winning=${winningUrl}, losing=[${losingUrls.join(', ')}]`
    );

    const success = await resolveConflictForNote(
      docHandle,
      repo,
      vaultId,
      noteId,
      losingUrls
    );

    if (!success) {
      // Queue for retry - losing doc might not be synced yet
      pendingConflictResolutions.set(noteId, { losingUrls, retryCount: 0 });
      startRetryLoop(docHandle, repo, vaultId);
    }
  }
}

/**
 * Check all daily notes for content URL conflicts.
 * Called once on startup after initialization.
 */
export async function checkAllDailyNoteConflicts(
  docHandle: DocHandle<NotesDocument>,
  repo: Repo,
  vaultId: string | null
): Promise<void> {
  await checkAndResolveContentUrlConflicts(docHandle, repo, vaultId);
}

/**
 * Clean up timers (call when switching vaults).
 */
export function clearConflictResolutionState(): void {
  pendingConflictResolutions.clear();
  if (retryTimerId !== null) {
    clearTimeout(retryTimerId);
    retryTimerId = null;
  }
}
