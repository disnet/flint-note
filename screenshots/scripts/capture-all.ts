import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import {
  navigateToSystemView,
  selectNoteByTitle,
  openChatPanel,
  fillDailyEntry,
  getTodayIndex,
  resetScrollPositions,
  resetDocumentScroll,
  pinNoteByTitle
} from '../helpers/navigation';
import { setupDemoVault, setThemeDirect } from '../helpers/data-setup';
import { waitForAnimations } from '../helpers/wait-utils';
import type { Page } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_VAULT_PATH = path.join(__dirname, '../example-vault');

/**
 * Send a chat message and wait for the response
 */
async function sendChatMessage(window: Page, message: string): Promise<void> {
  // Wait for the chat panel to be visible
  await window.waitForSelector('.chat-panel.visible', { timeout: 5000 });
  await waitForAnimations(window, 300);

  // Wait for the CodeMirror editor to be ready
  await window.waitForSelector('.chat-panel .cm-editor .cm-content', { timeout: 5000 });

  // Click on the editor content area to focus it
  const editorContent = await window.$('.chat-panel .cm-editor .cm-content');
  if (editorContent) {
    await editorContent.click();
    await waitForAnimations(window, 100);
    await window.keyboard.type(message);
    await waitForAnimations(window, 100);

    // Click send button
    const sendButton = await window.$('.send-button');
    if (sendButton) {
      await sendButton.click();
    }

    // Wait for the response to stream
    await waitForAnimations(window, 2500);
  }
}

test.describe('App Screenshots', () => {
  test('capture all screenshots', async () => {
    console.log('\n📸 Capturing app screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Pin some notes for a better sidebar appearance
      console.log('  📌 Pinning notes...');
      await pinNoteByTitle(window, 'Flow States');
      await pinNoteByTitle(window, 'The Science of Creativity');
      await pinNoteByTitle(window, 'Chapter 1 Draft');

      // =========================================
      // 1. Open Note
      // =========================================
      console.log('  📝 Capturing open note...');

      // Select an interesting note
      await selectNoteByTitle(window, 'The Science of Creativity');
      await waitForAnimations(window, 300);

      // Light theme
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'note-light',
        description: 'Open note in light theme'
      });

      // Dark theme
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'note-dark',
        description: 'Open note in dark theme'
      });

      // =========================================
      // 2. Daily View
      // =========================================
      console.log('  📅 Capturing daily view...');

      await navigateToSystemView(window, 'daily');
      await waitForAnimations(window, 500);

      // Find today's position in the week
      const todayIndex = await getTodayIndex(window);

      // Fill in entries for previous days (relative to today)
      const dailyContent = [
        // 3 days ago
        `## Morning Reflection\n\nGood writing session today. Started exploring the connection between [[Flow States]] and creative work.\n\n## Reading\n\nContinuing [[Thinking, Fast and Slow]] - the chapter on cognitive ease is fascinating.`,
        // 2 days ago
        `## Morning Pages\n\nThree pages of free writing. Noticed a recurring theme about constraints enabling creativity. See [[The Science of Creativity]].\n\n## Notes\n\n- Podcast recommendation from M: "On Being Creative"\n- New coffee spot has good morning light`,
        // Yesterday
        `## Writing Session\n\n**Words**: 520\n**Working on**: [[Chapter 1 Draft]]\n\nUsed the mid-sentence technique from [[Writing Habits of Famous Authors]]. Left off at a good point for tomorrow.\n\n## Evening\n\nRe-read some notes on [[Flow States]]. The connection to deep work is becoming clearer.`,
        // Today
        `## Morning\n\nEnergized start to the day. Morning pages flowed easily - wrote about intentions for the week.\n\n## Reading\n\nStarted a new section of [[Thinking, Fast and Slow]]. Added thoughts to [[Questions to explore]].\n\n## Tasks\n\n- Continue [[Chapter 1 Draft]]\n- Review [[Flow States]] notes`
      ];

      // Fill entries starting from 3 days before today
      for (let offset = 3; offset >= 0; offset--) {
        const dayIndex = todayIndex - offset;
        if (dayIndex >= 0 && dayIndex < 7) {
          const contentIndex = 3 - offset;
          await fillDailyEntry(window, dayIndex, dailyContent[contentIndex]);
        }
      }

      // Reset all scroll positions after filling entries
      await resetScrollPositions(window);
      await resetDocumentScroll(window);

      // Light theme
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);
      await resetDocumentScroll(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'daily-light',
        description: 'Daily notes view in light theme'
      });

      // Dark theme
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);
      await resetDocumentScroll(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'daily-dark',
        description: 'Daily notes view in dark theme'
      });

      // =========================================
      // 3. Note with Agent Interaction
      // =========================================
      console.log('  🤖 Capturing agent interaction...');

      // Go back to a note first
      await selectNoteByTitle(window, 'Flow States');
      await waitForAnimations(window, 300);

      // Open chat panel
      await openChatPanel(window);
      await waitForAnimations(window, 500);

      // Send a message
      await sendChatMessage(
        window,
        'What connections do my notes make between creativity and flow?'
      );

      // Reset scroll before capturing
      await resetDocumentScroll(window);

      // Light theme
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);
      await resetDocumentScroll(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'agent-light',
        description: 'Note with agent interaction in light theme'
      });

      // Dark theme
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);
      await resetDocumentScroll(window);
      await captureScreenshot(window, {
        category: 'main',
        name: 'agent-dark',
        description: 'Note with agent interaction in dark theme'
      });

      console.log('\n✅ All screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
