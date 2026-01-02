import { Page } from 'playwright';
import { waitForAnimations } from './wait-utils';

export type SystemView =
  | 'settings'
  | 'types'
  | 'daily'
  | 'review'
  | 'inbox'
  | 'routines'
  | null;

/**
 * Navigate to a system view using the sidebar navigation
 */
export async function navigateToSystemView(
  window: Page,
  view: SystemView
): Promise<void> {
  if (!view) return;

  const viewLabels: Record<string, string> = {
    settings: 'Settings',
    types: 'Note Types',
    daily: 'Daily',
    review: 'Review',
    inbox: 'Inbox',
    routines: 'Routines'
  };

  const label = viewLabels[view];
  if (label) {
    // Click the nav item by its text content
    await window.click(`.nav-item:has-text("${label}")`);
    await waitForAnimations(window);
  }
}

/**
 * Navigate back to the notes/home view (deselect any system view)
 */
export async function navigateToNotes(window: Page): Promise<void> {
  // Click on "Notes" in sidebar or press Escape to close system views
  await window.keyboard.press('Escape');
  await waitForAnimations(window);
}

/**
 * Create a new note using keyboard shortcut
 */
export async function createNewNote(window: Page, title?: string): Promise<void> {
  const isMac = process.platform === 'darwin';
  await window.keyboard.press(isMac ? 'Meta+Shift+n' : 'Control+Shift+n');
  await waitForAnimations(window, 700);

  if (title) {
    // Focus should be on title, type the title
    await window.keyboard.type(title);
    // Press Tab to move to editor content
    await window.keyboard.press('Tab');
  }
}

/**
 * Toggle the left sidebar visibility
 */
export async function toggleSidebar(window: Page): Promise<void> {
  const isMac = process.platform === 'darwin';
  await window.keyboard.press(isMac ? 'Meta+b' : 'Control+b');
  await waitForAnimations(window);
}

/**
 * Open the quick search (Command Palette)
 */
export async function openQuickSearch(window: Page): Promise<void> {
  const isMac = process.platform === 'darwin';
  await window.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
  await waitForAnimations(window);
}

/**
 * Close the quick search
 */
export async function closeQuickSearch(window: Page): Promise<void> {
  await window.keyboard.press('Escape');
  await waitForAnimations(window, 200);
}

/**
 * Open the chat panel via FAB menu
 */
export async function openChatPanel(window: Page): Promise<void> {
  // Hover over the FAB container to expand the menu
  const fabContainer = await window.$('.fab-container');
  if (fabContainer) {
    await fabContainer.hover();
    await waitForAnimations(window, 300);

    // Click the main FAB (chat) button
    const chatButton = await window.$('.fab-main');
    if (chatButton) {
      await chatButton.click();
      await waitForAnimations(window, 300);
    }
  }
}

/**
 * Close any open floating panel (chat, shelf)
 */
export async function closeFloatingPanels(window: Page): Promise<void> {
  await window.keyboard.press('Escape');
  await waitForAnimations(window, 200);
}

/**
 * Open the shelf panel via FAB menu
 */
export async function openShelfPanel(window: Page): Promise<void> {
  // Hover over the FAB container to expand the menu
  const fabContainer = await window.$('.fab-container');
  if (fabContainer) {
    await fabContainer.hover();
    await waitForAnimations(window, 300);

    // Click the shelf button
    const shelfButton = await window.$('.shelf-button');
    if (shelfButton) {
      await shelfButton.click();
      await waitForAnimations(window, 300);
    }
  }
}

/**
 * Select a note by searching for its title
 */
export async function selectNoteByTitle(window: Page, title: string): Promise<void> {
  await openQuickSearch(window);
  await window.keyboard.type(title);
  await waitForAnimations(window, 300);
  await window.keyboard.press('Enter');
  await waitForAnimations(window);
}
