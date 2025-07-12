/**
 * Search Handlers
 *
 * Handles all search operations including basic search, advanced search with filters,
 * and direct SQL search functionality.
 */

import { filterNoteFields, filterSearchResults } from '../utils/field-filter.js';
import { validateToolArgs } from './validation.js';
import type {
  SearchNotesArgs,
  SearchNotesAdvancedArgs,
  SearchNotesSqlArgs,
  VaultContext
} from './types.js';

export class SearchHandlers {
  constructor(private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>) {}

  /**
   * Handles basic note search with optional type filtering and regex support
   */
  handleSearchNotes = async (args: SearchNotesArgs) => {
    // Validate arguments
    validateToolArgs('search_notes', args);

    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);

    const results = await hybridSearchManager.searchNotes(
      args.query,
      args.type_filter,
      args.limit,
      args.use_regex
    );

    // Apply field filtering if specified
    const filteredResults = args.fields
      ? results.map(result => filterNoteFields(result, args.fields))
      : results;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filteredResults, null, 2)
        }
      ]
    };
  };

  /**
   * Handles advanced search with structured filters for metadata, dates, and content
   */
  handleSearchNotesAdvanced = async (args: SearchNotesAdvancedArgs) => {
    // Validate arguments
    validateToolArgs('search_notes_advanced', args);

    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);

    const results = await hybridSearchManager.searchNotesAdvanced(args);

    // Apply field filtering if specified
    const filteredResults = filterSearchResults(results, args.fields);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filteredResults, null, 2)
        }
      ]
    };
  };

  /**
   * Handles direct SQL search against the notes database for maximum flexibility
   */
  handleSearchNotesSQL = async (args: SearchNotesSqlArgs) => {
    // Validate arguments
    validateToolArgs('search_notes_sql', args);

    const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);

    const results = await hybridSearchManager.searchNotesSQL(args);

    // Apply field filtering if specified
    const filteredResults = filterSearchResults(results, args.fields);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filteredResults, null, 2)
        }
      ]
    };
  };
}
