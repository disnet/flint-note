import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp } from '../helpers/electron-app';
import { captureScreenshot } from '../helpers/screenshot';
import { selectNoteByTitle, toggleSidebar } from '../helpers/navigation';
import { setupDemoVault, setThemeDirect } from '../helpers/data-setup';
import { waitForAnimations } from '../helpers/wait-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_VAULT_PATH = path.join(__dirname, '../example-vault');

// Notes to capture - pick ones that showcase different features
const NOTES_TO_CAPTURE = [
  {
    title: 'Welcome to Flint',
    name: 'welcome',
    description: 'Welcome note with wikilinks and formatted text'
  },
  {
    title: 'Website Redesign',
    name: 'project-tasks',
    description: 'Project note with task checkboxes'
  },
  {
    title: 'AI in Note-Taking',
    name: 'research-table',
    description: 'Research note with table and structured content'
  }
];

test.describe('Note Screenshots', () => {
  test('capture individual notes', async () => {
    console.log('\n📸 Capturing note screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      for (const note of NOTES_TO_CAPTURE) {
        console.log(`  Capturing "${note.title}"...`);

        // Select the note
        await selectNoteByTitle(window, note.title);
        await waitForAnimations(window, 500);

        // Light theme
        await setThemeDirect(window, 'light');
        await waitForAnimations(window);

        await captureScreenshot(window, {
          category: 'notes',
          name: `${note.name}-light`,
          description: `${note.description} (light theme)`
        });

        // Dark theme
        await setThemeDirect(window, 'dark');
        await waitForAnimations(window);

        await captureScreenshot(window, {
          category: 'notes',
          name: `${note.name}-dark`,
          description: `${note.description} (dark theme)`
        });
      }

      console.log('\n✅ Note screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });

  test('capture focused note (no sidebar)', async () => {
    console.log('\n📸 Capturing focused note screenshots...\n');

    const { electronApp, window } = await launchApp({
      cleanState: true,
      importVault: EXAMPLE_VAULT_PATH,
      vaultName: 'Demo Vault'
    });

    try {
      await setupDemoVault(window);

      // Select a visually appealing note
      await selectNoteByTitle(window, 'Welcome to Flint');
      await waitForAnimations(window, 500);

      // Hide sidebar for focused view
      await toggleSidebar(window);
      await waitForAnimations(window);

      // Light theme
      await setThemeDirect(window, 'light');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'notes',
        name: 'focused-note-light',
        description: 'Note in focused mode without sidebar (light)'
      });

      // Dark theme
      await setThemeDirect(window, 'dark');
      await waitForAnimations(window);

      await captureScreenshot(window, {
        category: 'notes',
        name: 'focused-note-dark',
        description: 'Note in focused mode without sidebar (dark)'
      });

      console.log('\n✅ Focused note screenshots complete!\n');
    } finally {
      await closeApp(electronApp);
    }
  });
});
