import type { NoteReference } from '../types/chat';

export interface MessagePart {
  type: 'text' | 'note';
  content: string;
  note?: NoteReference;
}

// Mock note database for demo purposes
const mockNotes: NoteReference[] = [
  {
    id: '1',
    title: 'Project Planning Template',
    type: 'project',
    path: '/projects/planning-template.md'
  },
  {
    id: '2',
    title: 'Daily Standup Notes',
    type: 'daily',
    path: '/daily/2024-01-15.md'
  },
  {
    id: '3',
    title: 'Meeting with Design Team',
    type: 'meeting',
    path: '/meetings/design-sync-2024-01-15.md'
  },
  {
    id: '4',
    title: 'Feature Ideas Brainstorm',
    type: 'idea',
    path: '/ideas/feature-brainstorm.md'
  },
  {
    id: '5',
    title: 'API Documentation',
    type: 'reference',
    path: '/reference/api-docs.md'
  }
];

/**
 * Parse message content to identify note references
 * This is a simplified version - in reality, this would integrate with the MCP server
 */
export function parseMessageContent(content: string): MessagePart[] {
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
    const note = findNoteByTitleOrPath(noteTitleOrPath);

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
 * Find a note by title or path
 */
function findNoteByTitleOrPath(titleOrPath: string): NoteReference | null {
  // First try to find by exact title match
  let note = mockNotes.find(n => n.title === titleOrPath);

  if (!note) {
    // Try to find by path
    note = mockNotes.find(n => n.path === titleOrPath);
  }

  if (!note) {
    // Try fuzzy matching on title
    note = mockNotes.find(n =>
      n.title.toLowerCase().includes(titleOrPath.toLowerCase()) ||
      titleOrPath.toLowerCase().includes(n.title.toLowerCase())
    );
  }

  return note || null;
}

/**
 * Generate a mock message with note references for demo purposes
 */
export function generateMockMessageWithNotes(): string {
  const templates = [
    "I've updated the [[Project Planning Template]] with the new sections you requested. You might also want to check the [[Daily Standup Notes]] for recent progress updates.",
    "Based on our [[Meeting with Design Team]], I've created a new [[Feature Ideas Brainstorm]] document. The [[API Documentation]] has also been updated.",
    "The [[Daily Standup Notes]] show good progress on the current sprint. Let me know if you need to update the [[Project Planning Template]].",
    "I found some relevant information in the [[API Documentation]]. This should help with the ideas we discussed in [[Feature Ideas Brainstorm]]."
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Extract note references from message content
 */
export function extractNoteReferences(content: string): NoteReference[] {
  const parts = parseMessageContent(content);
  return parts
    .filter(part => part.type === 'note' && part.note)
    .map(part => part.note!)
    .filter(note => note.id !== 'broken'); // Filter out broken references
}

/**
 * Check if a message contains note references
 */
export function hasNoteReferences(content: string): boolean {
  return /\[\[([^\]|]+)(\|([^\]]+))?\]\]/.test(content);
}
