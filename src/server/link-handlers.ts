/**
 * Link Handlers
 *
 * Handles all link management operations including getting note links, backlinks,
 * finding broken links, searching by link relationships, and link migration.
 */

import { LinkExtractor } from '../core/link-extractor.js';
import type { NoteRow } from '../database/schema.js';
import type { VaultContext } from './types.js';

export class LinkHandlers {
  constructor(
    private resolveVaultContext: (vaultId?: string) => Promise<VaultContext>,
    private generateNoteIdFromIdentifier: (identifier: string) => string
  ) {}

  /**
   * Gets all links for a specific note (incoming, outgoing internal, and external)
   */
  handleGetNoteLinks = async (args: { identifier: string; vault_id?: string }) => {
    try {
      const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
      const db = await hybridSearchManager.getDatabaseConnection();
      const noteId = this.generateNoteIdFromIdentifier(args.identifier);

      // Check if note exists
      const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
      if (!note) {
        throw new Error(`Note not found: ${args.identifier}`);
      }

      const links = await LinkExtractor.getLinksForNote(noteId, db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                note_id: noteId,
                links: links
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

  /**
   * Gets all notes that link to the specified note (backlinks)
   */
  handleGetBacklinks = async (args: { identifier: string; vault_id?: string }) => {
    try {
      const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
      const db = await hybridSearchManager.getDatabaseConnection();
      const noteId = this.generateNoteIdFromIdentifier(args.identifier);

      // Check if note exists
      const note = await db.get('SELECT id FROM notes WHERE id = ?', [noteId]);
      if (!note) {
        throw new Error(`Note not found: ${args.identifier}`);
      }

      const backlinks = await LinkExtractor.getBacklinks(noteId, db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                note_id: noteId,
                backlinks: backlinks
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

  /**
   * Finds all broken wikilinks (links to non-existent notes)
   */
  handleFindBrokenLinks = async (args?: { vault_id?: string }) => {
    try {
      const { hybridSearchManager } = await this.resolveVaultContext(args?.vault_id);
      const db = await hybridSearchManager.getDatabaseConnection();
      const brokenLinks = await LinkExtractor.findBrokenLinks(db);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                broken_links: brokenLinks,
                count: brokenLinks.length
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

  /**
   * Searches for notes based on their link relationships
   */
  handleSearchByLinks = async (args: {
    has_links_to?: string[];
    linked_from?: string[];
    external_domains?: string[];
    broken_links?: boolean;
    vault_id?: string;
  }) => {
    try {
      const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
      const db = await hybridSearchManager.getDatabaseConnection();
      let notes: NoteRow[] = [];

      // Handle different search criteria
      if (args.has_links_to && args.has_links_to.length > 0) {
        // Find notes that link to any of the specified notes
        const targetIds = args.has_links_to.map(id =>
          this.generateNoteIdFromIdentifier(id)
        );
        const placeholders = targetIds.map(() => '?').join(',');
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.source_note_id
           WHERE nl.target_note_id IN (${placeholders})`,
          targetIds
        );
      } else if (args.linked_from && args.linked_from.length > 0) {
        // Find notes that are linked from any of the specified notes
        const sourceIds = args.linked_from.map(id =>
          this.generateNoteIdFromIdentifier(id)
        );
        const placeholders = sourceIds.map(() => '?').join(',');
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.target_note_id
           WHERE nl.source_note_id IN (${placeholders})`,
          sourceIds
        );
      } else if (args.external_domains && args.external_domains.length > 0) {
        // Find notes with external links to specified domains
        const domainConditions = args.external_domains
          .map(() => 'el.url LIKE ?')
          .join(' OR ');
        const domainParams = args.external_domains.map(domain => `%${domain}%`);
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN external_links el ON n.id = el.note_id
           WHERE ${domainConditions}`,
          domainParams
        );
      } else if (args.broken_links) {
        // Find notes with broken internal links
        notes = await db.all(
          `SELECT DISTINCT n.* FROM notes n
           INNER JOIN note_links nl ON n.id = nl.source_note_id
           WHERE nl.target_note_id IS NULL`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                notes: notes,
                count: notes.length
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

  /**
   * Scans all existing notes and populates the link tables (one-time migration)
   */
  handleMigrateLinks = async (args: { force?: boolean; vault_id?: string }) => {
    try {
      const { hybridSearchManager } = await this.resolveVaultContext(args.vault_id);
      const db = await hybridSearchManager.getDatabaseConnection();

      // Check if migration is needed
      if (!args.force) {
        const existingLinks = await db.get<{ count: number }>(
          'SELECT COUNT(*) as count FROM note_links'
        );
        if (existingLinks && existingLinks.count > 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      'Link tables already contain data. Use force=true to migrate anyway.',
                    existing_links: existingLinks.count
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
      }

      // Get all notes from the database
      const notes = await db.all<{ id: string; content: string }>(
        'SELECT id, content FROM notes'
      );
      let processedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const note of notes) {
        try {
          // Extract links from note content
          const extractionResult = LinkExtractor.extractLinks(note.content);

          // Store the extracted links
          await LinkExtractor.storeLinks(note.id, extractionResult, db);
          processedCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${note.id}: ${errorMessage}`);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Link migration completed',
                total_notes: notes.length,
                processed: processedCount,
                errors: errorCount,
                error_details: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error details to first 10
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
