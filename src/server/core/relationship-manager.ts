/**
 * Relationship Manager
 *
 * Provides a unified view of note relationships, combining both
 * content-based links (wikilinks) and structural hierarchy relationships.
 */

import type {
  DatabaseConnection,
  NoteLinkRow,
  ExternalLinkRow
} from '../database/schema.js';
import type { NoteHierarchyRow } from '../database/schema.js';
import { LinkExtractor } from './link-extractor.js';
import { HierarchyManager } from './hierarchy.js';

export interface NoteRelationships {
  // Content-based links (from wikilinks in content)
  outgoing_links: NoteLinkRow[];
  incoming_links: NoteLinkRow[];
  external_links: ExternalLinkRow[];

  // Hierarchy-based relationships
  parents: NoteHierarchyRow[];
  children: NoteHierarchyRow[];

  // Combined relationship context
  all_related_notes: string[]; // All note IDs this note is related to
  relationship_strength: { [noteId: string]: number }; // Weighted relationship strength
}

export interface RelationshipGraph {
  nodes: { [noteId: string]: NoteRelationships };
  updated: string;
}

export class RelationshipManager {
  private db: DatabaseConnection;
  private hierarchyManager: HierarchyManager;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.hierarchyManager = new HierarchyManager(db);
  }

  /**
   * Get comprehensive relationships for a specific note
   */
  async getNoteRelationships(noteId: string): Promise<NoteRelationships> {
    // Get content-based links
    const contentLinks = await LinkExtractor.getLinksForNote(noteId, this.db);

    // Get hierarchy relationships
    const [parents, children] = await Promise.all([
      this.hierarchyManager.getParents(noteId),
      this.hierarchyManager.getChildren(noteId)
    ]);

    // Calculate all related notes and relationship strengths
    const relatedNotes = new Set<string>();
    const relationshipStrength: { [noteId: string]: number } = {};

    // Add content links (strength = 1)
    contentLinks.outgoing_internal.forEach((link) => {
      if (link.target_note_id) {
        relatedNotes.add(link.target_note_id);
        relationshipStrength[link.target_note_id] =
          (relationshipStrength[link.target_note_id] || 0) + 1;
      }
    });

    contentLinks.incoming.forEach((link) => {
      relatedNotes.add(link.source_note_id);
      relationshipStrength[link.source_note_id] =
        (relationshipStrength[link.source_note_id] || 0) + 1;
    });

    // Add hierarchy relationships (strength = 2 - stronger than content links)
    parents.forEach((parent) => {
      relatedNotes.add(parent.parent_id);
      relationshipStrength[parent.parent_id] =
        (relationshipStrength[parent.parent_id] || 0) + 2;
    });

    children.forEach((child) => {
      relatedNotes.add(child.child_id);
      relationshipStrength[child.child_id] =
        (relationshipStrength[child.child_id] || 0) + 2;
    });

    return {
      outgoing_links: contentLinks.outgoing_internal,
      incoming_links: contentLinks.incoming,
      external_links: contentLinks.outgoing_external,
      parents,
      children,
      all_related_notes: Array.from(relatedNotes),
      relationship_strength: relationshipStrength
    };
  }

  /**
   * Find notes related to the given note, sorted by relationship strength
   */
  async getRelatedNotes(
    noteId: string,
    maxResults: number = 10
  ): Promise<Array<{ noteId: string; strength: number; relationship_types: string[] }>> {
    const relationships = await this.getNoteRelationships(noteId);

    // Build result with relationship types
    const results: Array<{
      noteId: string;
      strength: number;
      relationship_types: string[];
    }> = [];

    for (const relatedNoteId of relationships.all_related_notes) {
      const types: string[] = [];

      // Check relationship types
      if (relationships.outgoing_links.some((l) => l.target_note_id === relatedNoteId)) {
        types.push('outgoing_link');
      }
      if (relationships.incoming_links.some((l) => l.source_note_id === relatedNoteId)) {
        types.push('incoming_link');
      }
      if (relationships.parents.some((p) => p.parent_id === relatedNoteId)) {
        types.push('parent');
      }
      if (relationships.children.some((c) => c.child_id === relatedNoteId)) {
        types.push('child');
      }

      results.push({
        noteId: relatedNoteId,
        strength: relationships.relationship_strength[relatedNoteId],
        relationship_types: types
      });
    }

    // Sort by strength and limit results
    return results.sort((a, b) => b.strength - a.strength).slice(0, maxResults);
  }

  /**
   * Find the shortest relationship path between two notes
   */
  async findRelationshipPath(
    startNoteId: string,
    endNoteId: string,
    maxDepth: number = 5
  ): Promise<Array<{ noteId: string; relationship: string }> | null> {
    // Use BFS to find shortest path combining both link and hierarchy relationships
    const visited = new Set<string>();
    const queue: Array<{
      noteId: string;
      path: Array<{ noteId: string; relationship: string }>;
    }> = [
      { noteId: startNoteId, path: [{ noteId: startNoteId, relationship: 'start' }] }
    ];

    while (queue.length > 0) {
      const { noteId, path } = queue.shift()!;

      if (noteId === endNoteId) {
        return path;
      }

      if (path.length > maxDepth || visited.has(noteId)) {
        continue;
      }

      visited.add(noteId);

      // Get all relationships for current note
      const relationships = await this.getNoteRelationships(noteId);

      // Add connected notes to queue
      for (const link of relationships.outgoing_links) {
        if (link.target_note_id && !visited.has(link.target_note_id)) {
          queue.push({
            noteId: link.target_note_id,
            path: [...path, { noteId: link.target_note_id, relationship: 'wikilink' }]
          });
        }
      }

      for (const link of relationships.incoming_links) {
        if (!visited.has(link.source_note_id)) {
          queue.push({
            noteId: link.source_note_id,
            path: [...path, { noteId: link.source_note_id, relationship: 'backlink' }]
          });
        }
      }

      for (const child of relationships.children) {
        if (!visited.has(child.child_id)) {
          queue.push({
            noteId: child.child_id,
            path: [...path, { noteId: child.child_id, relationship: 'child' }]
          });
        }
      }

      for (const parent of relationships.parents) {
        if (!visited.has(parent.parent_id)) {
          queue.push({
            noteId: parent.parent_id,
            path: [...path, { noteId: parent.parent_id, relationship: 'parent' }]
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get clustering coefficient for a note (how interconnected are its related notes)
   */
  async getClusteringCoefficient(noteId: string): Promise<number> {
    const relationships = await this.getNoteRelationships(noteId);
    const relatedNotes = relationships.all_related_notes;

    if (relatedNotes.length < 2) {
      return 0; // Cannot form clusters with less than 2 related notes
    }

    // Count connections between related notes
    let connections = 0;
    const totalPossibleConnections =
      (relatedNotes.length * (relatedNotes.length - 1)) / 2;

    for (let i = 0; i < relatedNotes.length; i++) {
      for (let j = i + 1; j < relatedNotes.length; j++) {
        const note1 = relatedNotes[i];
        const note2 = relatedNotes[j];

        // Check if these notes are connected to each other
        const note1Relationships = await this.getNoteRelationships(note1);
        if (note1Relationships.all_related_notes.includes(note2)) {
          connections++;
        }
      }
    }

    return connections / totalPossibleConnections;
  }

  /**
   * Build a full relationship graph for all notes (expensive operation)
   */
  async buildCompleteRelationshipGraph(): Promise<RelationshipGraph> {
    // Get all note IDs
    const notes = await this.db.all<{ id: string }>('SELECT id FROM notes');
    const graph: RelationshipGraph = {
      nodes: {},
      updated: new Date().toISOString()
    };

    // Build relationships for each note
    for (const note of notes) {
      graph.nodes[note.id] = await this.getNoteRelationships(note.id);
    }

    return graph;
  }
}
