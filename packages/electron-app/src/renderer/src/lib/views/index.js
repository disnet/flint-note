// View registry initialization
// Import this file to register all custom views
import { ViewRegistry } from './ViewRegistry';
import ImageNoteView from './ImageNoteView.svelte';
// Register the ImageNoteView for image note types
ViewRegistry.registerView('image', {
    component: ImageNoteView,
    modes: ['hybrid', 'edit', 'view'],
    supportedTypes: ['image'],
    priority: 1
});
// Registry is initialized when this module is imported
export { ViewRegistry };
