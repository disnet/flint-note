import type { NoteReference } from '../types/chat';

export interface MessagePart {
  type: 'text' | 'note';
  content: string;
  note?: NoteReference;
}

// Cache for note references to avoid repeated MCP calls
const noteCache = new Map<string, NoteReference | null>();

/**
 * Parse message content to identify note references
 * This version integrates with the MCP server to find actual notes
 */
export async function parseMessageContent(content: string): Promise<MessagePart[]> {
  const parts: MessagePart[] = [];

  // Pattern to match note references like [[Note Title]] or [[Note Title|display text]]
  const notePattern = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

  let lastIndex = 0;
  let match;

  while ((match = notePattern.exec(content)) !== null) {
    const [fullMatch, noteTitleOrPath, , displayText] = match;
    const matchStart = match.index;

    // Add text before the note reference
    if (matchStart > lastIndex) {
      const textContent = content.substring(lastIndex, matchStart);
      if (textContent) {
        parts.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Find the note by title or path
    const note = await findNoteByTitleOrPath(noteTitleOrPath);

    if (note) {
      parts.push({
        type: 'note',
        content: displayText || note.title,
        note
      });
    } else {
      // If note not found, treat as regular text but mark as broken reference
      parts.push({
        type: 'note',
        content: displayText || noteTitleOrPath,
        note: {
          id: 'broken',
          title: displayText || noteTitleOrPath,
          type: 'broken'
        }
      });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push({
        type: 'text',
        content: remainingText
      });
    }
  }

  // If no note references found, return the entire content as text
  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content
    });
  }

  return parts;
}

/**
 * Synchronous version that returns cached results or placeholder
 */
export function parseMessageContentSync(content: string): MessagePart[] {
  const parts: MessagePart[] = [];

  // Pattern to match note references like [[Note Title]] or [[Note Title|display text]]
  const notePattern = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

  let lastIndex = 0;
  let match;

  while ((match = notePattern.exec(content)) !== null) {
    const [fullMatch, noteTitleOrPath, , displayText] = match;
    const matchStart = match.index;

    // Add text before the note reference
    if (matchStart > lastIndex) {
      const textContent = content.substring(lastIndex, matchStart);
      if (textContent) {
        parts.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Check cache first
    const cachedNote = noteCache.get(noteTitleOrPath);
    if (cachedNote) {
      parts.push({
        type: 'note',
        content: displayText || cachedNote.title,
        note: cachedNote
      });
    } else {
      // Create placeholder note that will be resolved later
      parts.push({
        type: 'note',
        content: displayText || noteTitleOrPath,
        note: {
          id: 'loading',
          title: displayText || noteTitleOrPath,
          type: 'loading'
        }
      });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push({
        type: 'text',
        content: remainingText
      });
    }
  }

  // If no note references found, return the entire content as text
  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content
    });
  }

  return parts;
}

/**
 * Find a note by title or path using MCP
 */
async function findNoteByTitleOrPath(idOrTitle: string): Promise<NoteReference | null> {
  // Check cache first
  if (noteCache.has(idOrTitle)) {
    return noteCache.get(idOrTitle)!;
  }

  try {
    // First try advanced search with exact matching
    const searchResponse = await window.api.flintApi.searchNotesAdvanced({
      metadata_filters: [
        { key: 'id', value: idOrTitle, operator: '=' },
        { key: 'title', value: idOrTitle, operator: '=' }
      ],
      fields: ['id', 'type', 'title', 'path'],
      limit: 10
    });
    console.log(searchResponse);

    if (
      searchResponse.success &&
      searchResponse.result &&
      (searchResponse.result as any).notes
    ) {
      const notes = (searchResponse.result as any).notes;

      // Look for exact id match first
      let note = notes.find((n: any) => n.id === idOrTitle);

      if (!note) {
        // Try title match
        note = notes.find((n: any) => n.title === idOrTitle);
      }

      if (!note) {
        // Try fuzzy matching on title
        note = notes.find(
          (n: any) =>
            n.title &&
            (n.title.toLowerCase().includes(idOrTitle.toLowerCase()) ||
              idOrTitle.toLowerCase().includes(n.title.toLowerCase()))
        );
      }

      if (note) {
        const noteRef: NoteReference = {
          id: note.id,
          title: note.title,
          type: note.type,
          path: note.path
        };

        // Cache the result
        noteCache.set(idOrTitle, noteRef);
        return noteRef;
      }
    }

    // If advanced search didn't find anything, try a simple text search
    const fallbackResponse = await window.api.flintApi.searchNotes(idOrTitle, {
      limit: 10,
      fields: ['id', 'type', 'title', 'path']
    });

    if (
      fallbackResponse.success &&
      fallbackResponse.result &&
      (fallbackResponse.result as any).notes
    ) {
      const notes = (fallbackResponse.result as any).notes;

      // Look for fuzzy matching on title
      const note = notes.find(
        (n: any) =>
          n.title &&
          (n.title.toLowerCase().includes(idOrTitle.toLowerCase()) ||
            idOrTitle.toLowerCase().includes(n.title.toLowerCase()))
      );

      if (note) {
        const noteRef: NoteReference = {
          id: note.id,
          title: note.title,
          type: note.type,
          path: note.path
        };

        // Cache the result
        noteCache.set(idOrTitle, noteRef);
        return noteRef;
      }
    }

    // Cache null result to avoid repeated failed lookups
    noteCache.set(idOrTitle, null);
    return null;
  } catch (error) {
    console.error('Error finding note:', error);
    noteCache.set(idOrTitle, null);
    return null;
  }
}

/**
 * Generate a mock message with note references for demo purposes
 * This will use actual notes from the vault when available
 */
export async function generateMockMessageWithNotes(): Promise<string> {
  try {
    // Try to get some actual notes from the vault
    const listResponse = await window.api.flintApi.searchNotes('', {
      limit: 5
    });

    if (
      listResponse.success &&
      listResponse.result &&
      (listResponse.result as any).notes
    ) {
      const notes = Array.isArray((listResponse.result as any).notes)
        ? (listResponse.result as any).notes
        : [(listResponse.result as any).notes];

      if (notes.length >= 2) {
        const note1 = notes[0];
        const note2 = notes[1];

        const templates = [
          `I've updated the [[${note1.title}]] with the new sections you requested. You might also want to check the [[${note2.title}]] for recent progress updates.`,
          `Based on our recent work, I've found some relevant information in [[${note1.title}]]. This should help with the ideas we discussed in [[${note2.title}]].`,
          `The [[${note1.title}]] shows good progress. Let me know if you need to update the [[${note2.title}]].`,
          `I found some relevant information in the [[${note1.title}]]. This should help with the ideas we discussed in [[${note2.title}]].`
        ];

        return templates[Math.floor(Math.random() * templates.length)];
      }
    }
  } catch (error) {
    console.error('Error generating mock message:', error);
  }

  // Fallback to generic templates
  const templates = [
    "I've updated your notes with the new sections you requested. You might also want to check your daily notes for recent progress updates.",
    "Based on our recent work, I've found some relevant information in your project notes. This should help with the ideas we discussed.",
    'Your daily notes show good progress on the current sprint. Let me know if you need to update any project documentation.',
    'I found some relevant information in your reference notes. This should help with the ideas we discussed in your brainstorming session.'
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Extract note references from message content (async version)
 */
export async function extractNoteReferences(content: string): Promise<NoteReference[]> {
  const parts = await parseMessageContent(content);
  return parts
    .filter((part) => part.type === 'note' && part.note)
    .map((part) => part.note!)
    .filter((note) => note.id !== 'broken' && note.id !== 'loading'); // Filter out broken and loading references
}

/**
 * Extract note references from message content (sync version using cache)
 */
export function extractNoteReferencesSync(content: string): NoteReference[] {
  const parts = parseMessageContentSync(content);
  return parts
    .filter((part) => part.type === 'note' && part.note)
    .map((part) => part.note!)
    .filter((note) => note.id !== 'broken' && note.id !== 'loading'); // Filter out broken and loading references
}

/**
 * Check if a message contains note references
 */
export function hasNoteReferences(content: string): boolean {
  return /\[\[([^\]|]+)(\|([^\]]+))?\]\]/.test(content);
}

/**
 * Preload note references for a message to populate cache
 */
export async function preloadNoteReferences(content: string): Promise<void> {
  const notePattern = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  const noteTitles = new Set<string>();

  let match;
  while ((match = notePattern.exec(content)) !== null) {
    const [, noteTitleOrPath] = match;
    noteTitles.add(noteTitleOrPath);
  }

  // Load all notes in parallel
  const promises = Array.from(noteTitles).map((title) => findNoteByTitleOrPath(title));
  await Promise.all(promises);
}

/**
 * Clear the note cache
 */
export function clearNoteCache(): void {
  noteCache.clear();
}
