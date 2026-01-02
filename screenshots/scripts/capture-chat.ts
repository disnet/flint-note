import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import {
  openChatPanel,
  openShelfPanel,
  closeFloatingPanels
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
  // Chat input uses CodeMirror, so we need to click and type
  const editor = await window.$('.chat-panel .cm-editor');
  if (editor) {
    // Click to focus the editor
    await editor.click();
    await waitForAnimations(window, 100);

    // Type the message
    await window.keyboard.type(message);
    await waitForAnimations(window, 100);

    // Click the send button
    const sendButton = await window.$('.send-button');
    if (sendButton) {
      await sendButton.click();
    }

    // Wait for the mock response to stream (longer wait for full response)
    await waitForAnimations(window, 2500);
  }
}

test.describe('Chat and Shelf Screenshots', () => {
  test('capture chat panel with conversation', async () => {
    console.log('\n📸 Capturing chat panel screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Open chat panel
      await openChatPanel(window);
      await waitForAnimations(window, 500);

      // Set light theme first
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      // Send a greeting message
      console.log('  Sending greeting message...');
      await sendChatMessage(window, 'Hello! What can you help me with?');

      // Capture chat with conversation - light theme
      console.log('  Capturing conversation - light theme...');
      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-conversation-light',
        description: 'AI chat conversation in light theme'
      });

      // Switch to dark theme
      console.log('  Capturing conversation - dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-conversation-dark',
        description: 'AI chat conversation in dark theme'
      });

      // Send a follow-up message about searching
      console.log('  Sending follow-up message...');
      await sendChatMessage(window, 'Can you help me find my meeting notes?');

      // Capture multi-turn conversation
      console.log('  Capturing multi-turn conversation...');
      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-multi-turn-dark',
        description: 'Multi-turn AI chat conversation'
      });

      // Switch back to light for multi-turn
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-multi-turn-light',
        description: 'Multi-turn AI chat conversation in light theme'
      });

      await closeFloatingPanels(window);

      console.log('\n✅ Chat panel screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture empty chat panel', async () => {
    console.log('\n📸 Capturing empty chat panel...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Open chat panel (empty state)
      await openChatPanel(window);
      await waitForAnimations(window, 500);

      // Light theme
      console.log('  Capturing empty chat - light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-empty-light',
        description: 'Empty AI chat panel in light theme'
      });

      // Dark theme
      console.log('  Capturing empty chat - dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'chat-empty-dark',
        description: 'Empty AI chat panel in dark theme'
      });

      await closeFloatingPanels(window);

      console.log('\n✅ Empty chat panel screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture shelf panel', async () => {
    console.log('\n📸 Capturing shelf panel screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Open shelf panel
      await openShelfPanel(window);
      await waitForAnimations(window, 500);

      // Light theme
      console.log('  Capturing shelf - light theme...');
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'shelf-panel-light',
        description: 'Shelf panel in light theme'
      });

      // Dark theme
      console.log('  Capturing shelf - dark theme...');
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'chat',
        name: 'shelf-panel-dark',
        description: 'Shelf panel in dark theme'
      });

      await closeFloatingPanels(window);

      console.log('\n✅ Shelf panel screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
