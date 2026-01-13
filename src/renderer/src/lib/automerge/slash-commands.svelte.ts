/**
 * Slash commands extension for CodeMirror 6
 *
 * Provides a menu of insertable blocks and formatting options
 * triggered by typing "/" at the start of a line.
 */
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface SlashCommand {
  /** Display label in the menu */
  label: string;
  /** Text to insert (replaces the /command) */
  insert: string;
  /** Category for grouping */
  section: 'Block' | 'Link' | 'Special';
  /** Optional description shown in menu */
  description?: string;
  /** Icon or symbol to show */
  icon?: string;
  /** Cursor position offset after insertion (from end of inserted text) */
  cursorOffset?: number;
}

/**
 * Default slash commands
 */
export const defaultSlashCommands: SlashCommand[] = [
  // Block types
  {
    label: 'Heading 1',
    insert: '# ',
    section: 'Block',
    icon: 'H1',
    description: 'Large heading'
  },
  {
    label: 'Heading 2',
    insert: '## ',
    section: 'Block',
    icon: 'H2',
    description: 'Medium heading'
  },
  {
    label: 'Heading 3',
    insert: '### ',
    section: 'Block',
    icon: 'H3',
    description: 'Small heading'
  },
  {
    label: 'Bullet List',
    insert: '- ',
    section: 'Block',
    icon: '•',
    description: 'Unordered list'
  },
  {
    label: 'Numbered List',
    insert: '1. ',
    section: 'Block',
    icon: '1.',
    description: 'Ordered list'
  },
  {
    label: 'Todo',
    insert: '- [ ] ',
    section: 'Block',
    icon: '☐',
    description: 'Checkbox item'
  },
  {
    label: 'Code Block',
    insert: '```\n\n```',
    section: 'Block',
    icon: '</>',
    description: 'Code snippet',
    cursorOffset: -4
  },
  {
    label: 'Quote',
    insert: '> ',
    section: 'Block',
    icon: '"',
    description: 'Block quote'
  },
  {
    label: 'Divider',
    insert: '---\n',
    section: 'Block',
    icon: '―',
    description: 'Horizontal rule'
  },

  // Links
  {
    label: 'Wikilink',
    insert: '[[]]',
    section: 'Link',
    icon: '[[',
    description: 'Link to another note',
    cursorOffset: -2
  },
  {
    label: 'Link',
    insert: '[](url)',
    section: 'Link',
    icon: '🔗',
    description: 'External link',
    cursorOffset: -6
  },
  {
    label: 'Image',
    insert: '![](url)',
    section: 'Link',
    icon: '🖼',
    description: 'Embed image',
    cursorOffset: -6
  },

  // Special
  {
    label: 'Table',
    insert: '| Column 1 | Column 2 |\n|----------|----------|\n|          |          |',
    section: 'Special',
    icon: '▦',
    description: 'Insert table',
    cursorOffset: -23
  },
  {
    label: 'Callout',
    insert: '> [!note]\n> ',
    section: 'Special',
    icon: '💡',
    description: 'Highlighted callout'
  },
  {
    label: 'Deck',
    insert: '```flint-deck\nn-\n```',
    section: 'Special',
    icon: '🃏',
    description: 'Embed flashcard deck',
    cursorOffset: -5
  }
];

/**
 * Data passed to the slash menu handler
 */
export interface SlashMenuData {
  /** X position for menu */
  x: number;
  /** Y position for menu */
  y: number;
  /** Position where the "/" starts (for replacement) */
  slashFrom: number;
  /** Position where the "/" ends (cursor position) */
  slashTo: number;
}

export type SlashMenuHandler = (data: SlashMenuData | null) => void;

/**
 * Checks if "/" is typed at the start of a line (with optional leading whitespace)
 */
function checkForSlashTrigger(view: EditorView): { from: number; to: number } | null {
  const { state } = view;
  const selection = state.selection.main;

  // Only check when there's a cursor (no selection)
  if (!selection.empty) return null;

  const pos = selection.head;
  const line = state.doc.lineAt(pos);

  // Check if there's a "/" before the cursor
  if (pos <= line.from) return null;

  const charBefore = state.sliceDoc(pos - 1, pos);
  if (charBefore !== '/') return null;

  // Check if the "/" is at line start (with only whitespace before)
  const textBeforeSlash = state.sliceDoc(line.from, pos - 1);
  if (textBeforeSlash.trim().length > 0) return null;

  return { from: pos - 1, to: pos };
}

/**
 * Creates a view plugin that detects "/" at line start and triggers a callback
 */
function createSlashMenuPlugin(onShowMenu: SlashMenuHandler): Extension {
  return ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {}

      update(update: ViewUpdate): void {
        // Check on doc changes (typing)
        if (update.docChanged) {
          const slashPos = checkForSlashTrigger(this.view);

          if (slashPos) {
            // Defer coordinate reading until after update completes
            const view = this.view;
            const from = slashPos.from;
            const to = slashPos.to;
            requestAnimationFrame(() => {
              const coords = view.coordsAtPos(from);
              if (coords) {
                onShowMenu({
                  x: coords.left,
                  y: coords.bottom + 4,
                  slashFrom: from,
                  slashTo: to
                });
              }
            });
          }
        }

        // Close menu when selection changes (but not from our own dispatch)
        if (update.selectionSet && !update.docChanged) {
          // Check if slash is still there
          const slashPos = checkForSlashTrigger(this.view);
          if (!slashPos) {
            onShowMenu(null);
          }
        }
      }
    }
  );
}

/**
 * Applies a slash command: replaces the "/" with the command's insert text
 */
export function applySlashCommand(
  view: EditorView,
  command: SlashCommand,
  slashFrom: number,
  slashTo: number
): void {
  const insertText = command.insert;

  view.dispatch({
    changes: { from: slashFrom, to: slashTo, insert: insertText }
  });

  // Position cursor if specified
  if (command.cursorOffset !== undefined) {
    const newPos = slashFrom + insertText.length + command.cursorOffset;
    view.dispatch({
      selection: { anchor: newPos }
    });
  }

  view.focus();
}

/**
 * Creates a slash menu extension that triggers a callback when "/" is typed at line start.
 * The callback receives position info to display a custom menu.
 */
export function slashMenuExtension(onShowMenu: SlashMenuHandler): Extension {
  return createSlashMenuPlugin(onShowMenu);
}

// Keep exports for backward compatibility
export { defaultSlashCommands as slashCommands };
