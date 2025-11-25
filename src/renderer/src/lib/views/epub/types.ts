// Types for EPUB viewer components

export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface EpubMetadata {
  title?: string;
  author?: string | string[];
  publisher?: string;
  language?: string;
  description?: string;
  [key: string]: unknown;
}

export interface EpubLocation {
  index: number;
  fraction: number;
  totalLocations?: number;
}
