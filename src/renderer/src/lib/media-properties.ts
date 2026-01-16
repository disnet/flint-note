/**
 * Media-specific property definitions and default chips configuration
 * Used by MediaChips to provide property definitions for media notes (EPUB, PDF, Webpage)
 */

import type { PropertyDefinition, SourceFormat } from './automerge/types';

/**
 * Property definitions for EPUB notes.
 * These complement whatever properties are defined on the note's type.
 */
export const EPUB_PROPERTIES: PropertyDefinition[] = [
  { name: 'epubAuthor', type: 'string', description: 'Book author' },
  { name: 'progress', type: 'number', description: 'Reading progress (0-100)' },
  { name: 'lastRead', type: 'date', description: 'Last reading time' },
  { name: 'highlights', type: 'number', description: 'Highlight count' }
];

/**
 * Property definitions for PDF notes.
 */
export const PDF_PROPERTIES: PropertyDefinition[] = [
  { name: 'pdfAuthor', type: 'string', description: 'Document author' },
  { name: 'pages', type: 'string', description: 'Current/total pages' },
  { name: 'progress', type: 'number', description: 'Reading progress (0-100)' },
  { name: 'lastRead', type: 'date', description: 'Last reading time' },
  { name: 'highlights', type: 'number', description: 'Highlight count' }
];

/**
 * Property definitions for Webpage notes.
 */
export const WEBPAGE_PROPERTIES: PropertyDefinition[] = [
  { name: 'webpageSiteName', type: 'string', description: 'Website name' },
  { name: 'webpageAuthor', type: 'string', description: 'Article author' },
  { name: 'progress', type: 'number', description: 'Reading progress (0-100)' },
  { name: 'lastRead', type: 'date', description: 'Last reading time' },
  { name: 'highlights', type: 'number', description: 'Highlight count' },
  { name: 'source', type: 'string', description: 'Original source URL' }
];

/**
 * Default editorChips configuration for media types when note type doesn't specify.
 * This matches the current hardcoded behavior in media viewers.
 */
export const MEDIA_DEFAULT_CHIPS: Partial<Record<SourceFormat, string[]>> = {
  epub: ['epubAuthor', 'progress', 'lastRead', 'highlights'],
  pdf: ['pdfAuthor', 'pages', 'progress', 'lastRead', 'highlights'],
  webpage: [
    'webpageSiteName',
    'webpageAuthor',
    'progress',
    'lastRead',
    'highlights',
    'source'
  ]
};

/**
 * Get media-specific property definitions for a source format.
 */
export function getMediaProperties(sourceFormat: SourceFormat): PropertyDefinition[] {
  switch (sourceFormat) {
    case 'epub':
      return EPUB_PROPERTIES;
    case 'pdf':
      return PDF_PROPERTIES;
    case 'webpage':
      return WEBPAGE_PROPERTIES;
    default:
      return [];
  }
}

/**
 * Get default editorChips for a source format (when note type doesn't specify).
 */
export function getMediaDefaultChips(sourceFormat: SourceFormat): string[] {
  return MEDIA_DEFAULT_CHIPS[sourceFormat] ?? ['updated'];
}
