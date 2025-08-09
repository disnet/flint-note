# Custom Note Views System

## Overview

The Custom Note Views system allows developers to create specialized UI components for different note types in Flint. Instead of using the default markdown editor for all notes, specific note types can have custom interfaces that better suit their content and purpose.

## Architecture

### Core Components

#### ViewRegistry (`src/renderer/src/lib/views/ViewRegistry.ts`)
The central registry that manages custom view components for note types.

**Key Features:**
- Priority-based view selection
- Multiple view modes (edit, view, hybrid)
- Type-safe component registration
- Dynamic view resolution

**Interface:**
```typescript
interface NoteView {
  component: ComponentType;
  modes: ViewMode[];
  supportedTypes: string[];
  priority: number;
}

interface NoteViewProps {
  activeNote: Record<string, unknown>;
  noteContent: string;
  metadata: Record<string, unknown>;
  onContentChange: (content: string) => void;
  onMetadataChange: (metadata: Record<string, unknown>) => void;
  onSave: () => void;
}
```

#### BaseNoteView (`src/renderer/src/lib/views/BaseNoteView.svelte`)
Optional base component providing common functionality for custom views.

#### MainView Integration
Modified to check for and load custom views dynamically, falling back to the default markdown editor when no custom view is available.

### View Registration

Views are registered in `src/renderer/src/lib/views/index.ts`:

```typescript
ViewRegistry.registerView('image', {
  component: ImageNoteView,
  modes: ['hybrid', 'edit', 'view'],
  supportedTypes: ['image'],
  priority: 1
});
```

## Creating Custom Views

### Step 1: Create the View Component

Create a new Svelte component in `src/renderer/src/lib/views/`:

```svelte
<script lang="ts">
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

  // Your custom logic here
</script>

<BaseNoteView 
  {activeNote} 
  {noteContent} 
  {metadata} 
  {onContentChange} 
  {onMetadataChange} 
  {onSave}
  let:handleContentChange
  let:handleMetadataChange
  let:handleSave
>
  <!-- Your custom UI here -->
</BaseNoteView>
```

### Step 2: Register the View

Add registration to `src/renderer/src/lib/views/index.ts`:

```typescript
import MyCustomView from './MyCustomView.svelte';

ViewRegistry.registerView('my-note-type', {
  component: MyCustomView,
  modes: ['hybrid'],
  supportedTypes: ['my-note-type'],
  priority: 1
});
```

### Step 3: Create Notes with the Custom Type

Create notes with `type: "my-note-type"` and they will automatically use your custom view.

## Example Implementation: ImageNoteView

The ImageNoteView demonstrates a complete custom view implementation:

### Features
- **Dual-pane layout**: Image preview alongside markdown editor
- **Multiple input methods**: URL input and file upload
- **Responsive design**: Adapts to mobile screens
- **Metadata integration**: Automatically saves image data to note metadata
- **Editor toggle**: Show/hide the markdown editor
- **Auto-save**: Changes are automatically persisted

### Layout Structure
```
┌─────────────────────────────────────────┐
│ Image Controls (URL, Upload, Toggle)   │
├─────────────────┬───────────────────────┤
│ Image Preview   │ Markdown Editor       │
│                 │ (toggleable)          │
│                 │                       │
└─────────────────┴───────────────────────┘
```

### Key Implementation Details

**Image URL Handling:**
```svelte
function handleImageUrlChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const updatedMetadata = { ...metadata, image_url: target.value };
  onMetadataChange(updatedMetadata);
}
```

**File Upload:**
```svelte
function handleImageUpload(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const updatedMetadata = { ...metadata, image_data: dataUrl };
      onMetadataChange(updatedMetadata);
    };
    reader.readAsDataURL(file);
  }
}
```

## Testing Instructions

### Manual Testing

#### Setup Test Environment
1. Build the application: `npm run build`
2. Start the development server: `npm run dev` (if available)
3. Ensure you have access to the Flint note-taking interface

#### Test Case 1: Basic Custom View Loading
1. Create a new note with type "image"
2. **Expected Result**: The ImageNoteView should load instead of the default markdown editor
3. **Verify**: You should see image upload controls and a split-pane layout

#### Test Case 2: Image URL Input
1. In an image-type note, enter an image URL in the "Image URL" field
2. Use a test URL like: `https://via.placeholder.com/300x200`
3. **Expected Result**: The image should display in the preview pane
4. **Verify**: The image appears and the metadata is saved

#### Test Case 3: File Upload
1. Click the "Upload Image" button
2. Select a local image file (PNG, JPG, etc.)
3. **Expected Result**: The image should display as a data URL
4. **Verify**: The image appears and the base64 data is saved to metadata

#### Test Case 4: Content Editing
1. With an image displayed, use the markdown editor on the right
2. Add some text content about the image
3. **Expected Result**: Content should save automatically
4. **Verify**: Refresh the note and confirm content persists

#### Test Case 5: Editor Toggle
1. Click the "Hide Editor" button
2. **Expected Result**: The markdown editor should disappear, image takes full width
3. Click "Show Editor" 
4. **Expected Result**: Editor reappears in split view

#### Test Case 6: Responsive Behavior
1. Resize the browser window to mobile width (<768px)
2. **Expected Result**: Layout should stack vertically
3. **Verify**: Controls remain accessible and usable

#### Test Case 7: Fallback Behavior
1. Create a note with a type other than "image" (e.g., "general")
2. **Expected Result**: Should use the default markdown editor
3. **Verify**: No custom view loads, standard editor appears

#### Test Case 8: Error Handling
1. Try uploading a non-image file
2. **Expected Result**: File should be ignored gracefully
3. Enter an invalid image URL
4. **Expected Result**: Should handle broken image gracefully

### Automated Testing (Future)

```typescript
// Example test structure for custom views
describe('ImageNoteView', () => {
  test('renders image from URL', async () => {
    // Test image URL rendering
  });

  test('handles file upload', async () => {
    // Test file upload functionality
  });

  test('saves metadata changes', async () => {
    // Test metadata persistence
  });

  test('toggles editor visibility', async () => {
    // Test editor show/hide
  });
});
```

## Troubleshooting

### Common Issues

**Custom view not loading:**
- Check that the note type exactly matches the registered type
- Verify the view is properly registered in `index.ts`
- Check browser console for import errors

**Images not displaying:**
- Verify image URLs are accessible
- Check CORS policies for external images
- Ensure uploaded files are valid image formats

**Metadata not saving:**
- Check that `onMetadataChange` is being called correctly
- Verify the metadata format matches expected structure
- Check network tab for save requests

**Layout issues:**
- Test responsive breakpoints
- Verify CSS variables are properly defined
- Check for conflicting styles

### Debug Tools

**View Registry Inspection:**
```typescript
// In browser console
console.log(ViewRegistry.getAllViews());
console.log(ViewRegistry.getView('image', 'hybrid'));
```

**Component Props Debugging:**
Add logging to your custom view components:
```typescript
$effect(() => {
  console.log('View props:', { activeNote, noteContent, metadata });
});
```

## Extension Points

### Additional View Types

The system is designed for easy extension. Consider implementing:

**PDF Viewer:**
- Embedded PDF display with annotation tools
- Metadata for page numbers, highlights

**Form Builder:**
- Structured data input with validation
- Dynamic field generation based on schema

**Kanban Board:**
- Task management with drag-and-drop
- Status tracking and progress visualization

**Timeline View:**
- Chronological event display
- Date-based navigation and filtering

### View Modes

Each view can support different modes:
- **Edit**: Full editing capabilities
- **View**: Read-only display optimized for consumption  
- **Hybrid**: Combined editing and preview (default)

### Advanced Features

**Multi-component Views:**
Register multiple components for the same note type with different priorities.

**Conditional Loading:**
Implement logic to choose views based on note content or metadata.

**Theme Integration:**
Ensure custom views respect the application's theming system using CSS custom properties.

## Performance Considerations

- **Lazy Loading**: Views are only loaded when needed
- **Memory Management**: Components are properly cleaned up
- **Large Files**: Consider image compression for uploaded files
- **Caching**: Implement intelligent caching for frequently accessed views

## Security Notes

- **File Uploads**: Only image files are processed in ImageNoteView
- **XSS Prevention**: All user content should be properly sanitized
- **URL Validation**: External image URLs should be validated
- **Data Storage**: Base64 images increase note size significantly

This system provides a robust foundation for creating rich, specialized interfaces for different types of content while maintaining the simplicity and flexibility that makes Flint powerful.