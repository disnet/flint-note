import { BrowserWindow } from 'electron';

// Event type definitions - must match renderer's ReviewEvent type
export type ReviewEvent =
  | { type: 'review.enabled'; noteId: string }
  | { type: 'review.disabled'; noteId: string }
  | { type: 'review.completed'; noteId: string };

/**
 * Publishes a review event to all renderer processes
 * This is the main process side of the event sourcing architecture
 */
export function publishReviewEvent(event: ReviewEvent): void {
  // Skip event publishing in test environment
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTestEnv) {
    return;
  }

  // BrowserWindow may not be available in all environments
  try {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      window.webContents.send('review-event', event);
    });
  } catch (error) {
    // Silently fail if BrowserWindow is not available
    console.warn('Failed to publish review event:', error);
  }
}
