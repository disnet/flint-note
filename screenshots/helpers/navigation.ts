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
 * Open the chat panel using the FAB menu
 */
export async function openChatPanel(window: Page): Promise<void> {
  // Look for the FAB menu button, then click the chat option
  const fabButton = await window.$('.fab-menu button, .fab-button');
  if (fabButton) {
    await fabButton.click();
    await waitForAnimations(window, 200);

    // Click the chat option in the menu
    const chatOption = await window.$(
      '.fab-menu-item:has-text("Chat"), button:has-text("Chat")'
    );
    if (chatOption) {
      await chatOption.click();
      await waitForAnimations(window);
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
 * Open the shelf panel using the FAB menu
 */
export async function openShelfPanel(window: Page): Promise<void> {
  const fabButton = await window.$('.fab-menu button, .fab-button');
  if (fabButton) {
    await fabButton.click();
    await waitForAnimations(window, 200);

    // Click the shelf option in the menu
    const shelfOption = await window.$(
      '.fab-menu-item:has-text("Shelf"), button:has-text("Shelf")'
    );
    if (shelfOption) {
      await shelfOption.click();
      await waitForAnimations(window);
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
