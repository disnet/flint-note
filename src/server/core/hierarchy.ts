/**
 * Hierarchy Manager
 *
 * Manages hierarchical relationships between notes, including parent-child
 * relationships, validation, and graph operations.
 */

import type { DatabaseConnection } from '../database/schema.js';
import type {
  HierarchyGraph,
  HierarchyValidation,
  HierarchyOperationResult
} from '../types/index.js';
import type { NoteHierarchyRow } from '../database/schema.js';

export class HierarchyManager {
  private db: DatabaseConnection;
  private hierarchyGraph: HierarchyGraph;
  private maxDepth: number = 10; // Default maximum nesting depth

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.hierarchyGraph = {
      hierarchies: {}
    };
  }

  /**
   * Add a parent-child relationship between two notes
   */
  async addSubnote(
    parentId: string,
    childId: string,
    position?: number
  ): Promise<HierarchyOperationResult> {
    const timestamp = new Date().toISOString();

    try {
      // Validate the relationship
      const validation = await this.validateHierarchyRelationship(
        parentId,
        childId,
        'add'
      );
      if (!validation.isValid) {
        return {
          success: false,
          parentId,
          childId,
          operation: 'add',
          timestamp,
          hierarchyUpdated: false,
          error: validation.errors.join(', ')
        };
      }

      // Determine position if not specified
      if (position === undefined) {
        const children = await this.getChildren(parentId);
        position = children.length;
      }

      // Insert the relationship into the database
      await this.db.run(
        `
        INSERT INTO note_hierarchies (parent_id, child_id, position, created, updated)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (parent_id, child_id) DO UPDATE SET
          position = excluded.position,
          updated = excluded.updated
      `,
        [parentId, childId, position, timestamp, timestamp]
      );

      // Update the in-memory hierarchy graph
      await this.refreshHierarchy(parentId);
      await this.refreshHierarchy(childId);

      return {
        success: true,
        parentId,
        childId,
        operation: 'add',
        timestamp,
        hierarchyUpdated: true
      };
    } catch (error) {
      return {
        success: false,
        parentId,
        childId,
        operation: 'add',
        timestamp,
        hierarchyUpdated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove a parent-child relationship
   */
  async removeSubnote(
    parentId: string,
    childId: string
  ): Promise<HierarchyOperationResult> {
    const timestamp = new Date().toISOString();

    try {
      // Remove the relationship from the database
      const result = await this.db.run(
        `
        DELETE FROM note_hierarchies 
        WHERE parent_id = ? AND child_id = ?
      `,
        [parentId, childId]
      );

      const hierarchyUpdated = (result.changes || 0) > 0;

      if (hierarchyUpdated) {
        // Update the in-memory hierarchy graph
        await this.refreshHierarchy(parentId);
        await this.refreshHierarchy(childId);
      }

      return {
        success: true,
        parentId,
        childId,
        operation: 'remove',
        timestamp,
        hierarchyUpdated
      };
    } catch (error) {
      return {
        success: false,
        parentId,
        childId,
        operation: 'remove',
        timestamp,
        hierarchyUpdated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reorder subnotes within a parent
   */
  async reorderSubnotes(
    parentId: string,
    childIds: string[]
  ): Promise<HierarchyOperationResult> {
    const timestamp = new Date().toISOString();

    try {
      // Validate all children belong to this parent
      const existingChildren = await this.getChildren(parentId);
      const existingChildIds = new Set(existingChildren.map((c) => c.child_id));

      for (const childId of childIds) {
        if (!existingChildIds.has(childId)) {
          return {
            success: false,
            parentId,
            childId: childIds.join(','),
            operation: 'reorder',
            timestamp,
            hierarchyUpdated: false,
            error: `Child ${childId} is not a child of ${parentId}`
          };
        }
      }

      // Update positions in a transaction
      await this.db.run('BEGIN TRANSACTION');

      try {
        for (let i = 0; i < childIds.length; i++) {
          await this.db.run(
            `
            UPDATE note_hierarchies 
            SET position = ?, updated = ?
            WHERE parent_id = ? AND child_id = ?
          `,
            [i, timestamp, parentId, childIds[i]]
          );
        }

        await this.db.run('COMMIT');
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }

      // Update the in-memory hierarchy graph
      await this.refreshHierarchy(parentId);

      return {
        success: true,
        parentId,
        childId: childIds.join(','),
        operation: 'reorder',
        timestamp,
        hierarchyUpdated: true
      };
    } catch (error) {
      return {
        success: false,
        parentId,
        childId: childIds.join(','),
        operation: 'reorder',
        timestamp,
        hierarchyUpdated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get the hierarchy path from root to the specified note
   */
  async getHierarchyPath(noteId: string): Promise<string[]> {
    const path: string[] = [];
    let currentNoteId = noteId;

    // Traverse up the hierarchy to find the root(s)
    const visited = new Set<string>();

    while (currentNoteId && !visited.has(currentNoteId)) {
      visited.add(currentNoteId);
      path.unshift(currentNoteId);

      const parents = await this.getParents(currentNoteId);
      if (parents.length === 0) {
        break; // Reached root
      }

      // For multiple parents, take the first one (could be enhanced with path selection logic)
      currentNoteId = parents[0].parent_id;
    }

    return path;
  }

  /**
   * Get all descendant notes up to specified depth
   */
  async getDescendants(noteId: string, maxDepth?: number): Promise<NoteHierarchyRow[]> {
    const descendants: NoteHierarchyRow[] = [];
    const depth = maxDepth || this.maxDepth;

    if (depth <= 0) return descendants;

    const children = await this.getChildren(noteId);
    descendants.push(...children);

    // Recursively get descendants
    for (const child of children) {
      const childDescendants = await this.getDescendants(child.child_id, depth - 1);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Get direct children of a note
   */
  async getChildren(noteId: string): Promise<NoteHierarchyRow[]> {
    return await this.db.all<NoteHierarchyRow>(
      `
      SELECT * FROM note_hierarchies 
      WHERE parent_id = ?
      ORDER BY position ASC
    `,
      [noteId]
    );
  }

  /**
   * Get direct parents of a note
   */
  async getParents(noteId: string): Promise<NoteHierarchyRow[]> {
    return await this.db.all<NoteHierarchyRow>(
      `
      SELECT * FROM note_hierarchies 
      WHERE child_id = ?
      ORDER BY created ASC
    `,
      [noteId]
    );
  }

  /**
   * Get the current hierarchy graph
   */
  getHierarchyGraph(): HierarchyGraph {
    return this.hierarchyGraph;
  }

  /**
   * Refresh hierarchy information for a specific note
   */
  async refreshHierarchy(noteId: string): Promise<void> {
    const [parents, children] = await Promise.all([
      this.getParents(noteId),
      this.getChildren(noteId)
    ]);

    // Calculate depth by traversing up the hierarchy
    const depth = await this.calculateDepth(noteId);

    this.hierarchyGraph.hierarchies[noteId] = {
      parents: parents.map((p) => p.parent_id),
      children: children.map((c) => c.child_id),
      depth
    };
  }

  /**
   * Calculate the depth of a note in the hierarchy
   */
  private async calculateDepth(
    noteId: string,
    visited: Set<string> = new Set()
  ): Promise<number> {
    if (visited.has(noteId)) {
      return 0; // Prevent infinite recursion
    }

    visited.add(noteId);
    const parents = await this.getParents(noteId);

    if (parents.length === 0) {
      return 0; // Root node
    }

    // Find the maximum depth among all parents
    let maxParentDepth = 0;
    for (const parent of parents) {
      const parentDepth = await this.calculateDepth(parent.parent_id, new Set(visited));
      maxParentDepth = Math.max(maxParentDepth, parentDepth);
    }

    return maxParentDepth + 1;
  }

  /**
   * Load the complete hierarchy graph from the database
   */
  async loadHierarchyGraph(): Promise<HierarchyGraph> {
    const allHierarchies = await this.db.all<{ note_id: string }>(`
      SELECT DISTINCT parent_id as note_id FROM note_hierarchies
      UNION
      SELECT DISTINCT child_id as note_id FROM note_hierarchies
    `);

    this.hierarchyGraph = { hierarchies: {} };

    for (const row of allHierarchies) {
      await this.refreshHierarchy(row.note_id);
    }

    return this.hierarchyGraph;
  }

  /**
   * Validate a hierarchy relationship before applying it
   */
  private async validateHierarchyRelationship(
    parentId: string,
    childId: string,
    operation: 'add' | 'remove'
  ): Promise<HierarchyValidation> {
    const validation: HierarchyValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      wouldCreateCycle: false,
      maxDepthExceeded: false
    };

    // Check if parent and child are the same
    if (parentId === childId) {
      validation.isValid = false;
      validation.errors.push('A note cannot be a parent of itself');
      return validation;
    }

    if (operation === 'add') {
      // Check if adding this relationship would create a cycle
      const wouldCreateCycle = await this.wouldCreateCycle(parentId, childId);
      if (wouldCreateCycle) {
        validation.isValid = false;
        validation.wouldCreateCycle = true;
        validation.errors.push(
          'Adding this relationship would create a circular dependency'
        );
      }

      // Check if adding this would exceed max depth
      const childDepth = await this.calculateDepth(childId);
      const parentDepth = await this.calculateDepth(parentId);

      if (parentDepth + 1 + childDepth > this.maxDepth) {
        validation.isValid = false;
        validation.maxDepthExceeded = true;
        validation.errors.push(
          `Adding this relationship would exceed maximum depth of ${this.maxDepth}`
        );
      }
    }

    return validation;
  }

  /**
   * Check if adding a parent-child relationship would create a cycle
   */
  private async wouldCreateCycle(parentId: string, childId: string): Promise<boolean> {
    // If childId is an ancestor of parentId, adding parentId->childId would create a cycle
    const ancestors = await this.getAncestors(parentId);
    return ancestors.includes(childId);
  }

  /**
   * Get all ancestors of a note (recursive parents)
   */
  private async getAncestors(
    noteId: string,
    visited: Set<string> = new Set()
  ): Promise<string[]> {
    if (visited.has(noteId)) {
      return []; // Prevent infinite recursion
    }

    visited.add(noteId);
    const ancestors: string[] = [];
    const parents = await this.getParents(noteId);

    for (const parent of parents) {
      ancestors.push(parent.parent_id);
      const parentAncestors = await this.getAncestors(parent.parent_id, new Set(visited));
      ancestors.push(...parentAncestors);
    }

    return [...new Set(ancestors)]; // Remove duplicates
  }
}
