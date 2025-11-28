import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
  StateField,
  StateEffect,
  Range,
  EditorState,
  type Extension
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { inlineImageTheme } from './inline-image-theme';

// Regex to match ![alt](path) markdown image syntax
const IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

export interface InlineImageMatch {
  from: number;
  to: number;
  altText: string;
  path: string;
  fullMatch: string;
}

export interface ImagePathClickHandler {
  (relativePath: string): void;
}

// Cache for blob URLs to avoid repeated fetches (non-reactive, just for performance)
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const imageBlobCache = new Map<string, string>();

// StateEffect for forcing image re-render
const forceImageUpdate = StateEffect.define<boolean>();

// StateField for storing the path click handler
const imagePathHandlerField = StateField.define<ImagePathClickHandler | null>({
  create() {
    return null;
  },
  update(handler) {
    return handler;
  }
});

/**
 * Check if a position is inside a code context (inline code or code block)
 */
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let inCode = false;

  tree.iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      // Check for inline code (InlineCode) or code blocks (FencedCode, CodeBlock)
      if (
        node.name === 'InlineCode' ||
        node.name === 'FencedCode' ||
        node.name === 'CodeBlock' ||
        node.name === 'CodeText'
      ) {
        inCode = true;
      }
    }
  });

  return inCode;
}

/**
 * Parse markdown content to find image syntax
 */
function parseInlineImages(text: string): InlineImageMatch[] {
  const matches: InlineImageMatch[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  IMAGE_REGEX.lastIndex = 0;

  while ((match = IMAGE_REGEX.exec(text)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      altText: match[1],
      path: match[2],
      fullMatch: match[0]
    });
  }

  return matches;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp'
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/**
 * Widget for rendering inline images with control bar
 */
class InlineImageWidget extends WidgetType {
  constructor(
    private altText: string,
    private path: string,
    private from: number,
    private to: number,
    private pathClickHandler: ImagePathClickHandler | null
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'inline-image-container';

    // Create image element
    const img = document.createElement('img');
    img.className = 'inline-image inline-image-loading';
    img.alt = this.altText;

    // Load image via IPC
    this.loadImage(img);

    // Create control bar
    const controlBar = document.createElement('div');
    controlBar.className = 'inline-image-control-bar';

    // Alt text input
    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.className = 'inline-image-alt-input';
    altInput.value = this.altText;
    altInput.placeholder = 'Alt text';

    // Prevent editor from handling input events and stealing focus
    altInput.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('focus', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('keyup', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('input', (e) => {
      e.stopPropagation();
    });

    altInput.addEventListener('change', () => {
      this.handleAltTextChange(view, altInput.value);
    });

    // Path button
    const pathButton = document.createElement('button');
    pathButton.className = 'inline-image-path';
    pathButton.textContent = this.path;
    pathButton.title = 'Open in file explorer';

    pathButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pathClickHandler?.(this.path);
    });

    controlBar.appendChild(altInput);
    controlBar.appendChild(pathButton);
    container.appendChild(img);
    container.appendChild(controlBar);

    return container;
  }

  private async loadImage(img: HTMLImageElement): Promise<void> {
    // Check cache first
    if (imageBlobCache.has(this.path)) {
      img.src = imageBlobCache.get(this.path)!;
      img.classList.remove('inline-image-loading');
      return;
    }

    try {
      const imageData = await window.api?.readImageFile({ relativePath: this.path });
      if (imageData) {
        // Create a new Uint8Array with a proper ArrayBuffer to satisfy TypeScript
        const buffer = new Uint8Array(imageData).buffer;
        const blob = new Blob([buffer], { type: getMimeType(this.path) });
        const blobUrl = URL.createObjectURL(blob);
        imageBlobCache.set(this.path, blobUrl);
        img.src = blobUrl;
        img.classList.remove('inline-image-loading');
      } else {
        this.showError(img);
      }
    } catch (error) {
      console.error('Failed to load image:', this.path, error);
      this.showError(img);
    }
  }

  private showError(img: HTMLImageElement): void {
    img.classList.remove('inline-image-loading');
    img.classList.add('inline-image-error');
    // Replace img with error div
    const errorDiv = document.createElement('div');
    errorDiv.className = 'inline-image-error';
    errorDiv.textContent = `Failed to load: ${this.path}`;
    img.replaceWith(errorDiv);
  }

  private handleAltTextChange(view: EditorView, newAltText: string): void {
    const newMarkdown = `![${newAltText}](${this.path})`;
    view.dispatch({
      changes: { from: this.from, to: this.to, insert: newMarkdown }
    });
  }

  eq(other: InlineImageWidget): boolean {
    return (
      this.altText === other.altText &&
      this.path === other.path &&
      this.from === other.from &&
      this.to === other.to
    );
  }

  updateDOM(): boolean {
    return false; // Always recreate for simplicity
  }

  get estimatedHeight(): number {
    return 200; // Estimated height for scrolling calculations
  }

  destroy(): void {
    // Blob URL cleanup is handled by cache management
  }
}

/**
 * Check if any cursor/selection overlaps with a range
 */
function isCursorInRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    // Check if cursor/selection overlaps with the image range
    if (range.from <= to && range.to >= from) {
      return true;
    }
  }
  return false;
}

/**
 * Create decorations for inline images in the document
 */
function decorateInlineImages(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();

  // Get current handler
  const pathClickHandler = state.field(imagePathHandlerField, false) || null;

  const images = parseInlineImages(text);

  for (const image of images) {
    // Skip images that are inside code contexts
    if (isInCodeContext(state, image.from)) {
      continue;
    }

    // Only render images from attachments/images directory
    if (!image.path.startsWith('attachments/images/')) {
      continue;
    }

    // Only render widget if the image is alone on its line (whitespace allowed)
    // This ensures typing on the same line shows raw markdown as feedback
    const line = state.doc.lineAt(image.from);
    const textBeforeImage = line.text.slice(0, image.from - line.from);
    const textAfterImage = line.text.slice(image.to - line.from);
    if (textBeforeImage.trim() !== '' || textAfterImage.trim() !== '') {
      continue;
    }

    // Skip if cursor is inside the image syntax - show raw markdown for editing
    if (isCursorInRange(state, image.from, image.to)) {
      continue;
    }

    const widget = new InlineImageWidget(
      image.altText,
      image.path,
      image.from,
      image.to,
      pathClickHandler
    );

    decorations.push(
      Decoration.replace({
        widget,
        inclusive: false,
        block: true
      }).range(image.from, image.to)
    );
  }

  return Decoration.set(decorations);
}

/**
 * State field for managing inline image decorations
 */
const inlineImageField = StateField.define<DecorationSet>({
  create(state) {
    return decorateInlineImages(state);
  },
  update(decorations, tr) {
    // Recalculate when document changes or selection changes
    // (cursor position affects whether we show the widget)
    if (tr.docChanged || tr.selection) {
      return decorateInlineImages(tr.state);
    }

    // Check if there's a force update effect
    for (const effect of tr.effects) {
      if (effect.is(forceImageUpdate)) {
        return decorateInlineImages(tr.state);
      }
    }

    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

/**
 * Extension that adds inline image support to CodeMirror
 */
export function inlineImagesExtension(
  pathClickHandler?: ImagePathClickHandler
): Extension {
  return [
    inlineImageTheme,
    imagePathHandlerField.init(() => pathClickHandler || null),
    inlineImageField
  ];
}

/**
 * Clear the image blob cache (useful on vault switch)
 */
export function clearImageCache(): void {
  for (const blobUrl of imageBlobCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  imageBlobCache.clear();
}
