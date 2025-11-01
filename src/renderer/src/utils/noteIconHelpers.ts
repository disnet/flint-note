import type { NoteMetadata, NoteType } from '../services/noteStore.svelte';

export interface IconData {
  type: 'emoji' | 'svg';
  value: string;
}

/**
 * Determine the icon to display for a note based on its metadata and type
 */
export function getNoteIconData(
  note: NoteMetadata,
  noteTypes: NoteType[]
): IconData {
  // Check for custom note type icon first
  const noteType = noteTypes.find((t) => t.name === note.type);
  if (noteType?.icon) {
    return { type: 'emoji', value: noteType.icon };
  }

  // Fall back to smart icon logic based on note metadata
  if (note.title.includes('daily') || note.title.match(/\d{4}-\d{2}-\d{2}/)) {
    return { type: 'svg', value: 'calendar' };
  }

  if (note.tags?.includes('project')) {
    return { type: 'svg', value: 'folder' };
  }

  return { type: 'svg', value: 'document' };
}

/**
 * Get icon based on source type (used for temporary tabs)
 */
export function getSourceIconData(source: string): IconData {
  return { type: 'svg', value: source };
}

/**
 * Generate SVG markup for a given icon type
 */
export function getIconSvg(iconType: string, size: number = 14): string {
  const props = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"`;

  switch (iconType) {
    case 'calendar':
      return `<svg ${props}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>`;

    case 'folder':
      return `<svg ${props}>
        <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"></path>
      </svg>`;

    case 'search':
      return `<svg ${props}>
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>`;

    case 'wikilink':
      return `<svg ${props}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
      </svg>`;

    case 'navigation':
    case 'history':
    case 'document':
    default:
      return `<svg ${props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14,2 14,8 20,8"></polyline>
      </svg>`;
  }
}
