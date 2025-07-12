/**
 * FlintNote API Usage Example (TypeScript)
 *
 * This example demonstrates how to use the FlintNote API for direct programmatic access
 * without needing to go through the MCP protocol. The API returns unwrapped data structures
 * instead of MCP-formatted responses.
 */

import { FlintNoteApi, type FlintNoteApiConfig } from '@flint-note/server/api';
import path from 'path';

async function main(): Promise<void> {
  // Create a new FlintNote API instance with typed configuration
  const config: FlintNoteApiConfig = {
    workspacePath: path.join(process.cwd(), 'example-workspace')
  };

  const api = new FlintNoteApi(config);

  try {
    // Initialize the API (required before any operations)
    console.log('Initializing FlintNote API...');
    await api.initialize();
    console.log('API initialized successfully!');

    // Create a simple note type
    console.log('\n1. Creating a note type...');
    await api.createNoteType({
      type_name: 'meeting',
      description: 'Meeting notes and action items',
      agent_instructions: [
        'Focus on capturing key decisions and action items',
        'Include attendees and date information'
      ],
      metadata_schema: {
        fields: [
          {
            name: 'attendees',
            type: 'array',
            description: 'List of meeting attendees',
            required: true
          },
          {
            name: 'date',
            type: 'date',
            description: 'Meeting date',
            required: true
          },
          {
            name: 'duration',
            type: 'number',
            description: 'Meeting duration in minutes'
          }
        ]
      }
    });
    console.log('Note type "meeting" created!');

    // Create a note using the convenient method
    console.log('\n2. Creating a simple note...');
    const createResult = await api.createSimpleNote(
      'meeting',
      'weekly-standup-2024-01-15',
      `# Weekly Standup - January 15, 2024

## Attendees
- Alice
- Bob
- Charlie

## Discussion Points
- Project progress update
- Sprint planning for next week
- Bug fixes needed

## Action Items
- [ ] Alice: Review pull request #123
- [ ] Bob: Update documentation
- [ ] Charlie: Fix critical bug in authentication
`
    );
    console.log('Note created:', createResult);

    // Get the note we just created
    console.log('\n3. Retrieving the note...');
    const note = await api.getNote('weekly-standup-2024-01-15');
    console.log('Retrieved note:', note);

    // Search for notes with proper typing
    console.log('\n4. Searching for notes...');
    const searchResults = await api.searchNotesByText('standup', undefined, 5);
    console.log('Search results:', searchResults);

    // Update the note content
    console.log('\n5. Updating note content...');
    // Note: The API now returns unwrapped data, so we can access properties directly
    if (note && typeof note === 'object' && 'content' in note) {
      const currentContent = (note as any).content || '';
      const updatedContent =
        currentContent +
        '\n\n## Follow-up\n- Meeting was productive\n- Next meeting scheduled for January 22';
      await api.updateNoteContent('weekly-standup-2024-01-15', updatedContent);
      console.log('Note updated successfully!');
    }

    // List all note types
    console.log('\n6. Listing note types...');
    const noteTypes = await api.listNoteTypes();
    console.log('Available note types:', noteTypes);

    // Get vault information
    console.log('\n7. Getting current vault info...');
    const vaultInfo = await api.getCurrentVault();
    console.log('Current vault:', vaultInfo);

    // Create multiple notes using the full API with proper typing
    console.log('\n8. Creating multiple notes...');
    const multipleNotesResult = await api.createNote({
      type: 'meeting',
      notes: [
        {
          type: 'meeting',
          title: 'project-kickoff-2024-01-16',
          content:
            '# Project Kickoff Meeting\n\nDiscussed project requirements and timeline.',
          metadata: {
            attendees: ['Alice', 'Bob', 'Project Manager'],
            date: '2024-01-16',
            duration: 60
          }
        },
        {
          type: 'meeting',
          title: 'client-review-2024-01-17',
          content: '# Client Review\n\nPresented initial designs and gathered feedback.',
          metadata: {
            attendees: ['Alice', 'Client Representative'],
            date: '2024-01-17',
            duration: 45
          }
        }
      ]
    });
    console.log('Multiple notes created:', multipleNotesResult);

    // Get workspace statistics
    console.log('\n9. Getting workspace statistics...');
    const stats = await api.getStatsResource();
    console.log('Workspace stats:', stats);

    // Advanced search example with typed parameters
    console.log('\n10. Advanced search example...');
    const advancedSearch = await api.searchNotesAdvanced({
      query: 'meeting',
      type: 'meeting',
      limit: 10,
      include_content: true
    });
    console.log('Advanced search results:', advancedSearch);

    // Link operations example
    console.log('\n11. Working with links...');

    // Get note links
    const noteLinks = await api.getNoteLinks('weekly-standup-2024-01-15');
    console.log('Note links:', noteLinks);

    // Get backlinks
    const backlinks = await api.getBacklinks('weekly-standup-2024-01-15');
    console.log('Backlinks:', backlinks);

    // SQL search example (be careful with SQL injection)
    console.log('\n12. SQL search example...');
    try {
      const sqlResults = await api.searchNotesSQL({
        query:
          "SELECT id, title, type FROM notes WHERE type = 'meeting' ORDER BY created DESC LIMIT 5"
      });
      console.log('SQL search results:', sqlResults);
    } catch (error) {
      console.log(
        'SQL search failed (this is expected if SQL search is restricted):',
        error
      );
    }

    // Note management operations
    console.log('\n13. Note management operations...');

    // Get note info
    const noteInfo = await api.getNoteInfo({ identifier: 'weekly-standup-2024-01-15' });
    console.log('Note info:', noteInfo);

    // List notes by type
    const meetingNotes = await api.listNotesByType({ type: 'meeting', limit: 10 });
    console.log('Meeting notes:', meetingNotes);

    // Demonstrate error handling
    console.log('\n14. Error handling example...');
    try {
      await api.getNote('non-existent-note');
    } catch (error) {
      console.log('Expected error for non-existent note:', error);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Demonstrate proper cleanup and error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the example
main()
  .then(() => {
    console.log('\n✅ TypeScript example completed successfully!');
    console.log(
      'Note: All API responses are now unwrapped and return direct data structures'
    );
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ TypeScript example failed:', error);
    process.exit(1);
  });
