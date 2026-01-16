/**
 * CodeMirror extension for inline image support.
 *
 * Features:
 * 1. Renders markdown images as inline widgets
 * 2. Handles drag-drop to insert images
 * 3. Handles clipboard paste to insert images
 *
 * Image syntax: ![alt](opfs://images/a1b2c3d4.png)
 */

import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSet, EditorState } from '@codemirror/state';
import type { Range, Extension } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { imageOpfsStorage } from './image-opfs-storage.svelte';
import {
  importImageFile,
  hasImageData,
  getImageFiles,
  buildMarkdownImageSyntax
} from './image-import.svelte';
import { getActiveVault } from './state.svelte';

// Regex to match OPFS image markdown: ![alt](opfs://images/hash.ext)
const IMAGE_REGEX = /!\[([^\]]*)\]\((opfs:\/\/images\/([a-f0-9]{8})\.(\w+))\)/gi;

// Effect to force decoration refresh
const forceImageUpdate = StateEffect.define<boolean>();

// Track loading state and blob URLs for images
interface ImageState {
  shortHash: string;
  extension: string;
  blobUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

// Module-level state for image loading
// Non-reactive to avoid Svelte 5 effect loops - these are internal caches
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const imageStates = new Map<string, ImageState>();
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const pendingLoads = new Set<string>();

/**
 * Get cache key for an image
 */
function getCacheKey(shortHash: string, extension: string): string {
  return `${shortHash}.${extension}`;
}

/**
 * Get or initialize image state
 */
function getImageState(shortHash: string, extension: string): ImageState {
  const key = getCacheKey(shortHash, extension);
  let state = imageStates.get(key);
  if (!state) {
    state = {
      shortHash,
      extension,
      blobUrl: null,
      isLoading: false,
      error: null
    };
    imageStates.set(key, state);
  }
  return state;
}

/**
 * Load image blob URL asynchronously
 * Uses setTimeout to defer dispatch and avoid "update in progress" errors
 */
async function loadImageBlobUrl(
  shortHash: string,
  extension: string,
  view: EditorView
): Promise<void> {
  const key = getCacheKey(shortHash, extension);

  // Skip if already loading
  if (pendingLoads.has(key)) {
    return;
  }

  const state = getImageState(shortHash, extension);

  // Skip if already loaded or has error
  if (state.blobUrl || state.error) {
    return;
  }

  pendingLoads.add(key);
  state.isLoading = true;

  try {
    const blobUrl = await imageOpfsStorage.getBlobUrl(shortHash, extension);
    state.blobUrl = blobUrl;
    state.isLoading = false;
    state.error = blobUrl ? null : 'Image not found';

    // Trigger re-render by dispatching an effect - defer to avoid update-in-progress errors
    setTimeout(() => {
      try {
        view.dispatch({
          effects: forceImageUpdate.of(true)
        });
      } catch {
        // View may have been destroyed - ignore
      }
    }, 0);
  } catch (error) {
    state.isLoading = false;
    state.error = error instanceof Error ? error.message : 'Failed to load image';

    // Trigger re-render - defer to avoid update-in-progress errors
    setTimeout(() => {
      try {
        view.dispatch({
          effects: forceImageUpdate.of(true)
        });
      } catch {
        // View may have been destroyed - ignore
      }
    }, 0);
  } finally {
    pendingLoads.delete(key);
  }
}

/**
 * Parse image matches from text
 */
interface ImageMatch {
  from: number;
  to: number;
  altText: string;
  url: string;
  shortHash: string;
  extension: string;
}

function parseImages(text: string): ImageMatch[] {
  const matches: ImageMatch[] = [];
  IMAGE_REGEX.lastIndex = 0;

  let match;
  while ((match = IMAGE_REGEX.exec(text)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      altText: match[1],
      url: match[2],
      shortHash: match[3].toLowerCase(),
      extension: match[4].toLowerCase()
    });
  }

  return matches;
}

/**
 * Check if position is inside a code block
 */
function isInCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  let inCode = false;

  tree.iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      const name = node.name;
      if (
        name === 'InlineCode' ||
        name === 'CodeBlock' ||
        name === 'FencedCode' ||
        name === 'CodeText' ||
        name === 'CodeInfo' ||
        name === 'CodeMark'
      ) {
        inCode = true;
        return false;
      }
      return undefined;
    }
  });

  return inCode;
}

/**
 * Image widget for rendering inline images with editing controls
 */
class ImageWidget extends WidgetType {
  constructor(
    private shortHash: string,
    private extension: string,
    private altText: string,
    private blobUrl: string | null,
    private isLoading: boolean,
    private error: string | null,
    private view: EditorView,
    private from: number,
    private to: number,
    private vaultBasePath: string | undefined
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-image-widget';

    if (this.isLoading) {
      container.classList.add('cm-image-loading');
      const placeholder = document.createElement('span');
      placeholder.className = 'cm-image-placeholder';
      placeholder.textContent = 'Loading...';
      container.appendChild(placeholder);
    } else if (this.error) {
      container.classList.add('cm-image-error');
      const errorEl = document.createElement('span');
      errorEl.className = 'cm-image-error-text';
      errorEl.textContent = `[Image: ${this.error}]`;
      container.appendChild(errorEl);
    } else if (this.blobUrl) {
      const img = document.createElement('img');
      img.src = this.blobUrl;
      img.alt = this.altText || '';
      img.className = 'cm-inline-image';
      img.draggable = false;

      // Request height remeasurement when image loads
      // This ensures CodeMirror's block height tracking stays accurate
      img.onload = () => {
        try {
          this.view.requestMeasure();
        } catch {
          // View may have been destroyed
        }
      };

      // Handle load errors
      img.onerror = () => {
        img.style.display = 'none';
        const errorEl = document.createElement('span');
        errorEl.className = 'cm-image-error-text';
        errorEl.textContent = '[Image failed to load]';
        container.appendChild(errorEl);
        // Also request remeasurement on error
        try {
          this.view.requestMeasure();
        } catch {
          // View may have been destroyed
        }
      };

      container.appendChild(img);

      // Add controls row below image
      const controlsRow = document.createElement('div');
      controlsRow.className = 'cm-image-controls';

      // Alt text input
      const altInput = document.createElement('input');
      altInput.type = 'text';
      altInput.className = 'cm-image-alt-input';
      altInput.placeholder = 'Alt text...';
      altInput.value = this.altText;

      // Update alt text on blur or enter
      const updateAltText = (): void => {
        const newAltText = altInput.value;
        if (newAltText !== this.altText) {
          const newMarkdown = `![${newAltText}](opfs://images/${this.shortHash}.${this.extension})`;
          try {
            this.view.dispatch({
              changes: {
                from: this.from,
                to: this.to,
                insert: newMarkdown
              }
            });
          } catch {
            // View may have been destroyed
          }
        }
      };

      altInput.addEventListener('blur', updateAltText);
      altInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          altInput.blur();
        }
        // Stop propagation to prevent editor from handling these keys
        e.stopPropagation();
      });
      // Prevent input events from bubbling to editor
      altInput.addEventListener('input', (e) => e.stopPropagation());

      controlsRow.appendChild(altInput);

      // File link (only if vault has base path)
      if (this.vaultBasePath) {
        const filePath = `files/images/${this.shortHash}.${this.extension}`;
        const fullPath = `${this.vaultBasePath}/${filePath}`;

        const fileLink = document.createElement('a');
        fileLink.className = 'cm-image-file-link';
        fileLink.href = '#';
        fileLink.textContent = filePath;
        fileLink.title = `Open in Finder: ${fullPath}`;

        fileLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Open in system file explorer
          window.api?.showItemInFolder({ path: fullPath });
        });

        controlsRow.appendChild(fileLink);
      }

      container.appendChild(controlsRow);
    } else {
      container.classList.add('cm-image-missing');
      const missing = document.createElement('span');
      missing.className = 'cm-image-missing-text';
      missing.textContent = `[Image not found: ${this.shortHash}.${this.extension}]`;
      container.appendChild(missing);
    }

    return container;
  }

  eq(other: ImageWidget): boolean {
    return (
      this.shortHash === other.shortHash &&
      this.extension === other.extension &&
      this.altText === other.altText &&
      this.blobUrl === other.blobUrl &&
      this.isLoading === other.isLoading &&
      this.error === other.error &&
      this.from === other.from &&
      this.to === other.to &&
      this.vaultBasePath === other.vaultBasePath
    );
  }

  ignoreEvent(event: Event): boolean {
    // Allow input, click, and keyboard events for the controls
    if (
      event.type === 'input' ||
      event.type === 'click' ||
      event.type === 'keydown' ||
      event.type === 'keyup' ||
      event.type === 'focus' ||
      event.type === 'blur'
    ) {
      return false;
    }
    return true;
  }
}

/**
 * Create image decorations for the document
 */
function createImageDecorations(state: EditorState, view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const images = parseImages(text);

  // Get vault base path for file links
  const vault = getActiveVault();
  const vaultBasePath = vault?.baseDirectory;

  for (const image of images) {
    // Skip images inside code blocks
    if (isInCodeContext(state, image.from)) {
      continue;
    }

    // Get or initialize state for this image
    const imageState = getImageState(image.shortHash, image.extension);

    // Trigger async load if needed
    if (!imageState.blobUrl && !imageState.isLoading && !imageState.error) {
      loadImageBlobUrl(image.shortHash, image.extension, view);
    }

    const widget = new ImageWidget(
      image.shortHash,
      image.extension,
      image.altText,
      imageState.blobUrl,
      imageState.isLoading,
      imageState.error,
      view,
      image.from,
      image.to,
      vaultBasePath
    );

    decorations.push(
      Decoration.replace({
        widget,
        inclusive: false,
        block: true // Make it a block widget for better layout
      }).range(image.from, image.to)
    );
  }

  return RangeSet.of(decorations.sort((a, b) => a.from - b.from));
}

/**
 * State field for image decorations
 */
function createImageField(view: EditorView): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create: (state) => createImageDecorations(state, view),
    update: (decorations, tr) => {
      // Check for force update effect
      for (const effect of tr.effects) {
        if (effect.is(forceImageUpdate)) {
          return createImageDecorations(tr.state, view);
        }
      }

      // Only recalculate if document changed
      if (tr.docChanged) {
        return createImageDecorations(tr.state, view);
      }

      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field)
  });
}

/**
 * DOM event handlers for image drag-drop and paste
 */
function createImageDomEventHandlers(): Extension {
  return EditorView.domEventHandlers({
    // Handle drop events for images
    drop: (event: DragEvent, view: EditorView) => {
      if (!event.dataTransfer) return false;

      // Check if there are image files
      const imageFiles = getImageFiles(event.dataTransfer);
      if (imageFiles.length === 0) return false;

      // Prevent default handling
      event.preventDefault();

      // Get drop position
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return true;

      // Import images and insert markdown
      (async () => {
        for (const file of imageFiles) {
          try {
            const result = await importImageFile(file);

            // Insert markdown at drop position
            view.dispatch({
              changes: {
                from: pos,
                to: pos,
                insert: result.markdownSyntax + '\n'
              }
            });
          } catch (error) {
            console.error('[Image Extension] Failed to import dropped image:', error);
          }
        }
      })();

      return true;
    },

    // Handle paste events for images
    paste: (event: ClipboardEvent, view: EditorView) => {
      if (!event.clipboardData) return false;

      // Check if there are image files
      if (!hasImageData(event.clipboardData)) return false;

      const imageFiles = getImageFiles(event.clipboardData);
      if (imageFiles.length === 0) return false;

      // Prevent default handling
      event.preventDefault();

      // Get cursor position
      const pos = view.state.selection.main.head;

      // Import first image and insert markdown
      (async () => {
        try {
          const result = await importImageFile(imageFiles[0]);

          // Insert markdown at cursor position
          view.dispatch({
            changes: {
              from: pos,
              to: pos,
              insert: result.markdownSyntax
            },
            selection: { anchor: pos + result.markdownSyntax.length }
          });
        } catch (error) {
          console.error('[Image Extension] Failed to import pasted image:', error);
        }
      })();

      return true;
    }
  });
}

/**
 * CSS styles for inline images
 */
const imageStyles = EditorView.baseTheme({
  '.cm-image-widget': {
    display: 'block',
    // Use padding instead of margin so CodeMirror's height measurement includes
    // the spacing. Margins are not included in offsetHeight/getBoundingClientRect,
    // which causes block height tracking and gutter positioning to be off.
    padding: '8px 0'
  },
  '.cm-inline-image': {
    maxWidth: '100%',
    maxHeight: '400px',
    objectFit: 'contain',
    borderRadius: '4px',
    display: 'block'
  },
  '.cm-image-controls': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
    padding: '4px 0',
    fontSize: '12px',
    width: '100%'
  },
  '.cm-image-alt-input': {
    flex: '1 1 auto',
    minWidth: '100px',
    padding: '4px 8px',
    border: '1px solid var(--border-color, #ddd)',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: 'var(--bg-primary, #fff)',
    color: 'var(--text-primary, #333)',
    outline: 'none',
    '&:focus': {
      borderColor: 'var(--accent-color, #007bff)',
      boxShadow: '0 0 0 2px var(--accent-color-subtle, rgba(0,123,255,0.25))'
    },
    '&::placeholder': {
      color: 'var(--text-tertiary, #999)'
    }
  },
  '.cm-image-file-link': {
    color: 'var(--text-secondary, #666)',
    textDecoration: 'none',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    '&:hover': {
      color: 'var(--accent-color, #007bff)',
      backgroundColor: 'var(--bg-tertiary, #eee)',
      textDecoration: 'underline'
    }
  },
  '.cm-image-loading, .cm-image-error, .cm-image-missing': {
    display: 'inline-block',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '12px'
  },
  '.cm-image-loading': {
    backgroundColor: 'var(--bg-secondary, #f0f0f0)',
    color: 'var(--text-secondary, #666)'
  },
  '.cm-image-error, .cm-image-missing': {
    backgroundColor: 'var(--bg-error-subtle, #fee)',
    color: 'var(--text-error, #c00)'
  },
  '.cm-image-placeholder': {
    fontStyle: 'italic'
  }
});

/**
 * Create the image extension for the editor
 */
export function imageExtension(): Extension {
  // We need access to the view to trigger re-renders
  // Use a view plugin to get access and create the state field
  return [
    imageStyles,
    createImageDomEventHandlers(),
    ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {
          // Add the state field after we have the view
          // Defer the dispatch to avoid "update in progress" error during initialization
          setTimeout(() => {
            try {
              const field = createImageField(view);
              if (!view.state.field(field, false)) {
                view.dispatch({
                  effects: StateEffect.appendConfig.of(field)
                });
              }
            } catch {
              // View may have been destroyed - ignore
            }
          }, 0);
        }
      }
    )
  ];
}

/**
 * Force refresh image decorations
 */
export function forceImageRefresh(view: EditorView): void {
  view.dispatch({
    effects: forceImageUpdate.of(true)
  });
}

/**
 * Clear all cached image states (for testing/cleanup)
 */
export function clearImageCache(): void {
  imageStates.clear();
  pendingLoads.clear();
  imageOpfsStorage.revokeAllBlobUrls();
}

/**
 * Manually insert an image at the cursor position
 */
export function insertImage(
  view: EditorView,
  shortHash: string,
  extension: string,
  altText: string = ''
): void {
  const pos = view.state.selection.main.head;
  const markdownSyntax = buildMarkdownImageSyntax(shortHash, extension, altText);

  view.dispatch({
    changes: {
      from: pos,
      to: pos,
      insert: markdownSyntax
    },
    selection: { anchor: pos + markdownSyntax.length }
  });
}
