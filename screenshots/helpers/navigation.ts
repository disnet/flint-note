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
 * Open the chat panel by clicking the chat button
 */
export async function openChatPanel(window: Page): Promise<void> {
  // Move mouse to trigger floatingUIState visibility
  await window.mouse.move(100, 100);
  await waitForAnimations(window, 100);

  // Wait for the FAB container to be visible
  await window.waitForSelector('.fab-container.visible', { timeout: 5000 });

  // Hover over the FAB container to expand the menu
  // This changes the aria-label from "Open menu" to "Open AI Chat"
  const fabContainer = await window.$('.fab-container');
  if (fabContainer) {
    await fabContainer.hover();
    await waitForAnimations(window, 200);

    // Now click the chat button (which now has the expanded aria-label)
    const chatButton = await window.$('button[aria-label="Open AI Chat"]');
    if (chatButton) {
      await chatButton.click();
      await waitForAnimations(window, 300);
      // Wait for the chat panel to be visible
      await window.waitForSelector('.chat-panel.visible', { timeout: 5000 });
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
 * Open the shelf panel via keyboard shortcut
 */
export async function openShelfPanel(window: Page): Promise<void> {
  const isMac = process.platform === 'darwin';
  await window.keyboard.press(isMac ? 'Meta+Shift+l' : 'Control+Shift+l');
  await waitForAnimations(window, 300);
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

/**
 * Focus on today's entry in the daily view
 * Only works when already in the daily view
 */
export async function focusOnToday(window: Page): Promise<void> {
  await window.keyboard.press('t');
  await waitForAnimations(window, 300);
}

/**
 * Navigate to previous week in daily view using [ shortcut
 */
export async function navigateToPreviousWeek(window: Page): Promise<void> {
  await window.keyboard.press('[');
  await waitForAnimations(window, 300);
}

/**
 * Navigate to next week in daily view using ] shortcut
 */
export async function navigateToNextWeek(window: Page): Promise<void> {
  await window.keyboard.press(']');
  await waitForAnimations(window, 300);
}

/**
 * Fill a daily entry by clicking on the day section and typing content.
 * @param window - The Playwright page
 * @param dayIndex - The index of the day in the week (0 = first day shown, usually Monday)
 * @param content - The content to type into the daily note
 */
export async function fillDailyEntry(
  window: Page,
  dayIndex: number,
  content: string
): Promise<void> {
  // Click on the day section's editor area to focus it
  const daySections = await window.$$('.day-section');
  if (dayIndex >= 0 && dayIndex < daySections.length) {
    const daySection = daySections[dayIndex];
    const editorContainer = await daySection.$('.editor-container');
    if (editorContainer) {
      await editorContainer.click();
      await waitForAnimations(window, 200);
      // Type the content
      await window.keyboard.type(content, { delay: 5 });
      await waitForAnimations(window, 100);
      // Click elsewhere to blur and save
      await window.click('.week-navigation');
      await waitForAnimations(window, 200);
    }
  }
}

/**
 * Get the index of today in the current week view.
 * Returns -1 if today is not visible in the current week.
 */
export async function getTodayIndex(window: Page): Promise<number> {
  const daySections = await window.$$('.day-section');
  for (let i = 0; i < daySections.length; i++) {
    const isToday = await daySections[i].evaluate((el) =>
      el.classList.contains('is-today')
    );
    if (isToday) {
      return i;
    }
  }
  return -1;
}

/**
 * Reset all scroll positions in the app to top.
 * Useful before taking screenshots to ensure consistent positioning.
 */
export async function resetScrollPositions(window: Page): Promise<void> {
  await window.evaluate(() => {
    // Reset main document scroll
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Reset common scrollable containers
    const scrollableSelectors = [
      '.main-view',
      '.timeline-container',
      '.daily-view',
      '.left-sidebar',
      '.sidebar-content'
    ];

    for (const selector of scrollableSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (el instanceof HTMLElement) {
          el.scrollTop = 0;
        }
      });
    }
  });
  await waitForAnimations(window, 100);
}

/**
 * Reset only the document-level scroll (not inner containers).
 * Useful after scrollIntoView operations that may have scrolled the document.
 */
export async function resetDocumentScroll(window: Page): Promise<void> {
  await window.evaluate(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Reset screenshot frame containers and app root
    const frameSelectors = [
      '#app',
      '.screenshot-wrapper',
      '.screenshot-window',
      '.screenshot-content'
    ];

    for (const selector of frameSelectors) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        el.scrollTop = 0;
      }
    }
  });
  await waitForAnimations(window, 50);
}

/**
 * Pin a note by its title.
 * First selects the note, then clicks the pin button.
 */
export async function pinNoteByTitle(window: Page, title: string): Promise<void> {
  // Select the note first
  await selectNoteByTitle(window, title);

  // Wait for the note to be fully loaded
  await window.waitForSelector('.note-editor', { timeout: 5000 });
  await waitForAnimations(window, 300);

  // Click the pin button in the header
  const pinButton = await window.$('button[aria-label="Pin"]');
  if (pinButton) {
    await pinButton.click();
    await waitForAnimations(window, 200);

    // Click elsewhere to clear hover state
    await window.click('.note-editor');
    await waitForAnimations(window, 100);

    // Reset scroll after clicking
    await resetDocumentScroll(window);
  }
}
