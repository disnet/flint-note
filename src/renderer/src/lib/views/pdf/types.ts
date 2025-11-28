// Types for PDF viewer components

export interface PdfOutlineItem {
  title: string;
  dest: string | unknown[]; // PDF destination
  items?: PdfOutlineItem[]; // Nested outline items
}

export interface PdfMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modDate?: Date;
}

export interface PdfLocation {
  pageNumber: number;
  totalPages: number;
}
