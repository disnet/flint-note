// View registry initialization
// Import this file to register all custom views
//
// Views are registered by content KIND (not type):
// - 'epub' kind renders with EpubNoteView
// - 'image' kind renders with ImageNoteView
// - 'markdown' kind uses the default markdown editor (no registration needed)

import { ViewRegistry } from './ViewRegistry';
import ImageNoteView from './ImageNoteView.svelte';
import EpubNoteView from './EpubNoteView.svelte';
import PdfNoteView from './PdfNoteView.svelte';

// Register the ImageNoteView for 'image' content kind
ViewRegistry.registerView('image', {
  component: ImageNoteView,
  modes: ['hybrid', 'edit', 'view'],
  supportedKinds: ['image'],
  priority: 1
});

// Register the EpubNoteView for 'epub' content kind
// This view handles epub notes regardless of their organizational type
ViewRegistry.registerView('epub', {
  component: EpubNoteView,
  modes: ['hybrid', 'view'],
  supportedKinds: ['epub'],
  priority: 1
});

// Register the PdfNoteView for 'pdf' content kind
// This view handles pdf notes regardless of their organizational type
ViewRegistry.registerView('pdf', {
  component: PdfNoteView,
  modes: ['hybrid', 'view'],
  supportedKinds: ['pdf'],
  priority: 1
});

// Registry is initialized when this module is imported
export { ViewRegistry };
