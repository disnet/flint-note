/**
 * Server Utilities
 *
 * Common utility functions used by the main server and handler modules.
 */

/**
 * Helper method to generate note ID from identifier
 * @param identifier - Note identifier (could be type/filename format or just filename)
 * @returns Properly formatted note ID
 */
export function generateNoteIdFromIdentifier(identifier: string): string {
  // Check if identifier is already in type/filename format
  if (identifier.includes('/')) {
    return identifier;
  }

  // If it's just a filename, we need to find the note and get its type
  // For now, we'll assume it's in the format we expect
  return identifier;
}

/**
 * Helper to check if workspace is required and available
 * @param workspace - Workspace instance to check
 * @throws Error if workspace is not available
 */
export function requireWorkspace(workspace?: unknown): void {
  if (!workspace) {
    throw new Error(
      'No vault configured. Use the create_vault tool to create a new vault, or list_vaults and switch_vault to use an existing one.'
    );
  }
}

/**
 * Helper to log initialization progress
 * @param message - Message to log
 * @param isError - Whether this is an error message
 */
export function logInitialization(message: string, isError: boolean = false): void {
  if (isError) {
    console.error(message);
  } else {
    console.error(message); // Using console.error for all server logs as per existing pattern
  }
}

/**
 * Helper to handle index rebuilding with progress reporting
 * @param hybridSearchManager - Search manager instance
 * @param forceRebuild - Whether to force rebuild
 */
export async function handleIndexRebuild(
  hybridSearchManager: {
    getStats(): Promise<{ noteCount: number }>;
    rebuildIndex(callback: (processed: number, total: number) => void): Promise<void>;
  },
  forceRebuild: boolean = false
): Promise<void> {
  try {
    const stats = await hybridSearchManager.getStats();
    const isEmptyIndex = stats.noteCount === 0;
    const shouldRebuild = forceRebuild || isEmptyIndex;

    if (shouldRebuild) {
      logInitialization('Rebuilding hybrid search index on startup...');
      await hybridSearchManager.rebuildIndex((processed: number, total: number) => {
        if (processed % 5 === 0 || processed === total) {
          logInitialization(`Hybrid search index: ${processed}/${total} notes processed`);
        }
      });
      logInitialization('Hybrid search index rebuilt successfully');
    } else {
      logInitialization(`Hybrid search index ready (${stats.noteCount} notes indexed)`);
    }
  } catch (error) {
    logInitialization(
      `Warning: Failed to initialize hybrid search index on startup: ${error}`,
      true
    );
  }
}
