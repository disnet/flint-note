/**
 * Note-related handlers for the FlintNote MCP Server
 */

import type { NoteMetadata } from '../types/index.js';
import { filterNoteFields } from '../utils/field-filter.js';
import { LinkExtractor } from '../core/link-extractor.js';
import type {
  CreateNoteArgs,
  GetNoteArgs,
  GetNotesArgs,
  UpdateNoteArgs,
  DeleteNoteArgs,
  RenameNoteArgs,
  GetNoteInfoArgs,
  ListNotesByTypeArgs,
  BulkDeleteNotesArgs,
  VaultContext
} from './types.js';

export class NoteHandlers {
  /**
   * Resolve vault context helper
   */
  private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>;
  private generateNoteIdFromIdentifier: (identifier: string) => string;
  private requireWorkspace: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private noteManager: any;

  constructor(
    resolveVaultContext: (vaultId?: string) => Promise<VaultContext>,
    generateNoteIdFromIdentifier: (identifier: string) => string,
    requireWorkspace: () => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    noteManager: any
  ) {
    this.resolveVaultContext = resolveVaultContext;
    this.generateNoteIdFromIdentifier = generateNoteIdFromIdentifier;
    this.requireWorkspace = requireWorkspace;
    this.noteManager = noteManager;
  }

  handleCreateNote = async (args: CreateNoteArgs) => {
    const { noteManager, noteTypeManager } = await this.resolveVaultContext(
      args.vault_id
    );

    // Handle batch creation if notes array is provided
    if (args.notes) {
      const result = await noteManager.batchCreateNotes(args.notes);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    // Handle single note creation
    if (!args.type || !args.title || !args.content) {
      throw new Error('Single note creation requires type, title, and content');
    }

    const noteInfo = await noteManager.createNote(
      args.type,
      args.title,
      args.content,
      args.metadata || {}
    );

    // Get agent instructions for this note type
    let agentInstructions: string[] = [];
    let nextSuggestions = '';
    try {
      const typeInfo = await noteTypeManager.getNoteTypeDescription(args.type);
      agentInstructions = typeInfo.parsed.agentInstructions;
      if (agentInstructions.length > 0) {
        nextSuggestions = `Consider following these guidelines for ${args.type} notes: ${agentInstructions.join(', ')}`;
      }
    } catch {
      // Ignore errors getting type info, continue without instructions
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...noteInfo,
              agent_instructions: agentInstructions,
              next_suggestions: nextSuggestions
            },
            null,
            2
          )
        }
      ]
    };
  };

  handleGetNote = async (args: GetNoteArgs) => {
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    const note = await noteManager.getNote(args.identifier);

    // Apply field filtering if specified
    const filteredNote = note ? filterNoteFields(note, args.fields) : null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filteredNote, null, 2)
        }
      ]
    };
  };

  handleGetNotes = async (args: GetNotesArgs) => {
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    // Validate identifiers parameter
    if (!args.identifiers || !Array.isArray(args.identifiers)) {
      throw new Error('identifiers parameter is required and must be an array');
    }

    const results = await Promise.allSettled(
      args.identifiers.map(async identifier => {
        try {
          const note = await noteManager.getNote(identifier);
          if (!note) {
            throw new Error(`Note not found: ${identifier}`);
          }

          // Apply field filtering if specified
          const filteredNote = filterNoteFields(note, args.fields);

          return { success: true, note: filteredNote };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return { success: false, error: errorMessage };
        }
      })
    );

    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: `Failed to retrieve note ${args.identifiers[index]}: ${result.reason}`
        };
      }
    });

    const successful = processedResults.filter(r => r.success).length;
    const failed = processedResults.filter(r => !r.success).length;

    const responseData = {
      success: true,
      results: processedResults,
      total_requested: args.identifiers.length,
      successful,
      failed
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseData, null, 2)
        }
      ]
    };
  };

  handleUpdateNote = async (args: UpdateNoteArgs) => {
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    // Handle batch updates if updates array is provided
    if (args.updates) {
      const result = await noteManager.batchUpdateNotes(args.updates);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    // Handle single note update
    if (!args.identifier) {
      throw new Error('Single note update requires identifier');
    }

    if (!args.content_hash) {
      throw new Error('content_hash is required for all update operations');
    }

    let result;
    if (args.content !== undefined && args.metadata !== undefined) {
      // Both content and metadata update
      result = await noteManager.updateNoteWithMetadata(
        args.identifier,
        args.content,
        args.metadata as NoteMetadata,
        args.content_hash
      );
    } else if (args.content !== undefined) {
      // Content-only update
      result = await noteManager.updateNote(
        args.identifier,
        args.content,
        args.content_hash
      );
    } else if (args.metadata !== undefined) {
      // Metadata-only update
      const currentNote = await noteManager.getNote(args.identifier);
      if (!currentNote) {
        throw new Error(`Note '${args.identifier}' not found`);
      }
      result = await noteManager.updateNoteWithMetadata(
        args.identifier,
        currentNote.content,
        args.metadata as NoteMetadata,
        args.content_hash
      );
    } else {
      throw new Error('Either content or metadata must be provided for update');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  };

  handleGetNoteInfo = async (args: GetNoteInfoArgs) => {
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    // Try to find the note by title or filename
    const searchResults = await noteManager.searchNotes({
      query: args.title_or_filename,
      type_filter: args.type,
      limit: 5
    });

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                found: false,
                message: `No note found with title or filename: ${args.title_or_filename}`
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Return the best match with filename info
    const bestMatch = searchResults[0];
    const filename = bestMatch.filename.replace('.md', '');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              found: true,
              filename: filename,
              title: bestMatch.title,
              type: bestMatch.type,
              path: bestMatch.path,
              wikilink_format: `${bestMatch.type}/${filename}`,
              suggested_wikilink: `[[${bestMatch.type}/${filename}|${bestMatch.title}]]`
            },
            null,
            2
          )
        }
      ]
    };
  };

  handleListNotesByType = async (args: ListNotesByTypeArgs) => {
    const { noteManager } = await this.resolveVaultContext(args.vault_id);

    const notes = await noteManager.searchNotes({
      type_filter: args.type,
      limit: args.limit || 50
    });

    const notesWithFilenames = (
      notes as Array<{
        filename: string;
        title: string;
        type: string;
        path: string;
        created: string;
        modified: string;
      }>
    ).map(note => ({
      filename: note.filename.replace('.md', ''),
      title: note.title,
      type: note.type,
      path: note.path,
      created: note.created,
      modified: note.modified,
      wikilink_format: `${note.type}/${note.filename.replace('.md', '')}`,
      suggested_wikilink: `[[${note.type}/${note.filename.replace('.md', '')}|${note.title}]]`
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(notesWithFilenames, null, 2)
        }
      ]
    };
  };

  handleDeleteNote = async (args: DeleteNoteArgs) => {
    try {
      const { noteManager } = await this.resolveVaultContext(args.vault_id);
      const result = await noteManager.deleteNote(args.identifier, args.confirm);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note '${args.identifier}' deleted successfully`,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  handleBulkDeleteNotes = async (args: BulkDeleteNotesArgs) => {
    this.requireWorkspace();

    try {
      const criteria = {
        type: args.type,
        tags: args.tags,
        pattern: args.pattern
      };

      const results = await this.noteManager.bulkDeleteNotes(criteria, args.confirm);

      const resultsArray = results as Array<{ deleted: boolean }>;
      const successCount = resultsArray.filter(r => r.deleted).length;
      const failureCount = resultsArray.length - successCount;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Bulk delete completed: ${successCount} deleted, ${failureCount} failed`,
                results,
                summary: {
                  total: resultsArray.length,
                  successful: successCount,
                  failed: failureCount
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };

  handleRenameNote = async (args: RenameNoteArgs) => {
    try {
      const { noteManager, hybridSearchManager } = await this.resolveVaultContext(
        args.vault_id
      );

      // Validate content_hash is provided
      if (!args.content_hash) {
        throw new Error('content_hash is required for rename operations');
      }

      // Get the current note to read current metadata
      const currentNote = await noteManager.getNote(args.identifier);
      if (!currentNote) {
        throw new Error(`Note '${args.identifier}' not found`);
      }

      // Update the title in metadata while preserving all other metadata
      const updatedMetadata = {
        ...currentNote.metadata,
        title: args.new_title
      };

      // Use the existing updateNoteWithMetadata method with protection bypass for rename
      const result = await noteManager.updateNoteWithMetadata(
        args.identifier,
        currentNote.content, // Keep content unchanged
        updatedMetadata,
        args.content_hash,
        true // Bypass protection for legitimate rename operations
      );

      let brokenLinksUpdated = 0;
      let wikilinksResult = { notesUpdated: 0, linksUpdated: 0 };

      // Update links using the vault-specific hybrid search manager
      const db = await hybridSearchManager.getDatabaseConnection();
      const noteId = this.generateNoteIdFromIdentifier(args.identifier);

      // Update broken links that might now be resolved due to the new title
      brokenLinksUpdated = await LinkExtractor.updateBrokenLinks(
        noteId,
        args.new_title,
        db
      );

      // Always update wikilinks in other notes
      wikilinksResult = await LinkExtractor.updateWikilinksForRenamedNote(
        noteId,
        currentNote.title,
        args.new_title,
        db
      );

      let wikilinkMessage = '';
      if (brokenLinksUpdated > 0) {
        wikilinkMessage = `\n\n🔗 Updated ${brokenLinksUpdated} broken links that now resolve to this note.`;
      }
      if (wikilinksResult.notesUpdated > 0) {
        wikilinkMessage += `\n🔗 Updated ${wikilinksResult.linksUpdated} wikilinks in ${wikilinksResult.notesUpdated} notes that referenced the old title.`;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Note renamed successfully${wikilinkMessage}`,
                old_title: currentNote.title,
                new_title: args.new_title,
                identifier: args.identifier,
                filename_unchanged: true,
                links_preserved: true,
                broken_links_resolved: brokenLinksUpdated,
                wikilinks_updated: true,
                notes_with_updated_wikilinks: wikilinksResult.notesUpdated,
                total_wikilinks_updated: wikilinksResult.linksUpdated,
                result
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  };
}
