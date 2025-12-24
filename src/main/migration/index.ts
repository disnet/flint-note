/**
 * Legacy vault migration module
 *
 * Provides functionality to migrate SQLite-based vaults to Automerge.
 */

// Types
export type {
  LegacyVaultInfo,
  MigrationProgress,
  MigrationResult,
  MigrationError,
  MigrationParams,
  LegacyVaultData,
  LegacyNoteRow,
  LegacyMetadataRow,
  LegacyNoteTypeRow,
  LegacyUIStateRow,
  LegacyReviewItemRow,
  EpubFileData
} from './types';

// Detection
export {
  detectLegacyVaults,
  detectLegacyVaultAtPath,
  getLegacyVaultInfo,
  hasExistingVault
} from './legacy-vault-detector';

// SQLite reading
export {
  getDatabasePath,
  isLegacyVault,
  getDatabaseModTime,
  getNoteCounts,
  getVaultId,
  extractVaultData,
  readEpubFile
} from './sqlite-reader';

// Data transformation
export {
  buildTypeIdMapping,
  transformVaultData,
  type TransformResult
} from './data-transformer';

// Migration service
export { migrateLegacyVault, getMigrationDocumentData } from './migration-service';

// Utilities
export {
  getSafeSyncDirectory,
  isSyncDirectory,
  ensureSyncDirectory,
  getVaultNameFromPath,
  containsLegacyVault,
  scanForLegacyVaults,
  getCommonVaultLocations
} from './utils';
