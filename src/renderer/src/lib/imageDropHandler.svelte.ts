import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export const SUPPORTED_IMAGE_FORMATS = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
] as const;

const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

function isValidImageFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return (
    SUPPORTED_EXTENSIONS.includes(ext || '') ||
    SUPPORTED_IMAGE_FORMATS.includes(
      file.type as (typeof SUPPORTED_IMAGE_FORMATS)[number]
    )
  );
}

async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

async function handleImageDrop(
  event: DragEvent,
  view: EditorView,
  imageFile: File
): Promise<void> {
  try {
    // Convert file to Uint8Array
    const fileData = await fileToUint8Array(imageFile);

    // Import via IPC
    const result = await window.api?.importImage({
      fileData,
      filename: imageFile.name
    });

    if (!result) {
      console.error('Failed to import image');
      return;
    }

    // Get drop position
    const pos = view.posAtCoords({
      x: event.clientX,
      y: event.clientY
    });

    const insertPos = pos ?? view.state.selection.main.head;
    const doc = view.state.doc;

    // Find the line at the insertion position
    const line = doc.lineAt(insertPos);

    // Determine where to insert the image and what newlines are needed
    // Images should always be on their own line
    let finalInsertPos: number;
    let prefix = '';
    const suffix = '\n';

    if (insertPos === line.from) {
      // At the start of a line
      if (line.from === 0) {
        // Very beginning of document - no prefix needed
        finalInsertPos = 0;
      } else {
        // Start of a line (not first) - insert here
        finalInsertPos = line.from;
      }
    } else if (insertPos === line.to) {
      // At the end of a line - add newline before image
      finalInsertPos = line.to;
      prefix = '\n';
    } else {
      // In the middle of a line - insert at end of current line
      finalInsertPos = line.to;
      prefix = '\n';
    }

    // If there's content after where we're inserting on the same line, we need the suffix
    // If we're at the end of the document, still add suffix for clean formatting
    const markdown = `${prefix}![](${result.path})${suffix}`;

    view.dispatch({
      changes: {
        from: finalInsertPos,
        insert: markdown
      },
      // Place cursor after the image (on the new line)
      selection: { anchor: finalInsertPos + markdown.length }
    });
  } catch (error) {
    console.error('Error importing image:', error);
  }
}

export function createImageDropExtension(): Extension {
  return EditorView.domEventHandlers({
    drop: (event, view) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return false;

      const imageFile = Array.from(files).find(isValidImageFile);
      if (!imageFile) return false;

      event.preventDefault();
      event.stopPropagation();

      // Handle the async operation without returning a promise
      void handleImageDrop(event, view, imageFile);

      return true;
    },

    dragover: (event) => {
      const files = event.dataTransfer?.files;
      if (files && Array.from(files).some(isValidImageFile)) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy';
        }
        return true;
      }
      return false;
    }
  });
}
