import { describe, it, expect, beforeEach } from 'vitest';
import { FlintApiService } from '../flintApiService';
import {
  mockFlintApiService,
  mockScenarios,
  testUtils,
  testDataSets
} from '../../../test/helpers/flintApiServiceMock';

/**
 * Example tests demonstrating different testing patterns for FlintApiService
 * These tests show how to use the mock helpers and test various scenarios
 */
describe('FlintApiService Examples', () => {
  describe('Basic Testing Patterns', () => {
    it('should demonstrate basic service mocking', async () => {
      // Create a basic mock service
      const service = mockFlintApiService().build();

      // Test initialization
      await service.initialize();
      expect(service.isReady()).toBe(true);

      // Test basic operations
      const note = await service.getNote('example-note');
      expect(note).toBeDefined();
      expect(note.title).toBe('Mock Note');
    });

    it('should demonstrate custom note setup', async () => {
      // Create service with specific notes
      const customNotes = [
        {
          id: 'note-1',
          identifier: 'daily-2024-01-01',
          title: 'Daily Note',
          content: '# Today\n\n- Review PRs\n- Team meeting',
          type: 'daily'
        },
        {
          id: 'note-2',
          identifier: 'project-alpha',
          title: 'Project Alpha',
          content: '# Project Alpha\n\nStatus: In Progress',
          type: 'project'
        }
      ];

      const service = mockFlintApiService()
        .withNotes(customNotes)
        .build();

      await service.initialize();

      // Test getting specific notes
      const dailyNote = await service.getNote('daily-2024-01-01');
      expect(dailyNote.type).toBe('daily');
      expect(dailyNote.content).toContain('Team meeting');

      const projectNote = await service.getNote('project-alpha');
      expect(projectNote.type).toBe('project');
      expect(projectNote.title).toBe('Project Alpha');
    });

    it('should demonstrate error handling scenarios', async () => {
      // Create service that fails initialization
      const service = mockFlintApiService()
        .failInitialization(new Error('Database connection failed'))
        .build();

      // Test initialization failure
      await expect(service.initialize()).rejects.toThrow('Database connection failed');
      expect(service.isReady()).toBe(false);
    });
  });

  describe('Pre-built Scenarios', () => {
    it('should test empty vault scenario', async () => {
      const service = mockScenarios.emptyVault();
      await service.initialize();

      // All note operations should return empty results
      const note = await service.getNote('any-note');
      expect(note).toBeNull();

      const searchResults = await service.searchNotes('test');
      expect(searchResults.notes).toHaveLength(0);
    });

    it('should test connection error scenario', async () => {
      const service = mockScenarios.connectionErrors();
      await service.initialize();

      // Connection test should fail
      const connectionTest = await service.testConnection();
      expect(connectionTest.success).toBe(false);
      expect(connectionTest.error).toBe('Connection failed');

      // Operations should throw errors
      await expect(service.getNote('test')).rejects.toThrow('Connection failed');
      await expect(service.createNote({})).rejects.toThrow('Connection failed');
    });

    it('should test large dataset scenario', async () => {
      const service = mockScenarios.largeDataset(500);
      await service.initialize();

      // Search should return many results
      const searchResults = await service.searchNotes('test');
      expect(searchResults.notes).toHaveLength(500);

      // Verify note structure
      const firstNote = searchResults.notes[0];
      expect(firstNote.id).toBe('note-0');
      expect(firstNote.title).toBe('Note 0');
    });
  });

  describe('Advanced Testing Patterns', () => {
    it('should test note lifecycle with real-like data', async () => {
      const service = mockFlintApiService()
        .withNotes(testDataSets.sampleNotes)
        .build();

      await service.initialize();

      // Test searching for different note types
      const searchResults = await service.searchNotes('meeting');
      const meetingNotes = searchResults.notes.filter(note => note.type === 'meeting');
      expect(meetingNotes).toHaveLength(1);
      expect(meetingNotes[0].title).toBe('Team Sync Meeting');

      // Test getting specific notes
      const dailyNote = await service.getNote('daily-2024-01-01');
      expect(dailyNote.content).toContain('Review project status');

      // Test note creation
      const createResult = await service.createSimpleNote(
        'idea',
        'new-feature-idea',
        '# New Feature\n\nIdea for improving user experience'
      );
      expect(createResult.success).toBe(true);
    });

    it('should test concurrent operations', async () => {
      const service = mockFlintApiService()
        .withNotes(testDataSets.sampleNotes)
        .build();

      await service.initialize();

      // Perform multiple operations concurrently
      const operations = [
        service.getNote('daily-2024-01-01'),
        service.getNote('meeting-team-sync'),
        service.getNote('project-alpha'),
        service.searchNotes('project'),
        service.getCurrentVault()
      ];

      const results = await Promise.all(operations);

      // Verify all operations completed successfully
      expect(results[0].identifier).toBe('daily-2024-01-01');
      expect(results[1].identifier).toBe('meeting-team-sync');
      expect(results[2].identifier).toBe('project-alpha');
      expect(results[3].notes).toBeDefined();
      expect(results[4].name).toBe('Mock Vault');
    });

    it('should test search functionality with different filters', async () => {
      const service = mockFlintApiService()
        .withNotes(testDataSets.sampleNotes)
        .build();

      await service.initialize();

      // Test basic search
      const basicSearch = await service.searchNotes('project');
      expect(basicSearch.notes.length).toBeGreaterThan(0);

      // Test search with options
      const filteredSearch = await service.searchNotes('team', {
        type_filter: 'meeting',
        limit: 5
      });
      expect(filteredSearch.notes).toBeDefined();

      // Test advanced search
      const advancedSearch = await service.searchNotesAdvanced({
        type: 'daily',
        content_contains: 'Tasks',
        limit: 10
      });
      expect(advancedSearch.notes).toBeDefined();
    });
  });

  describe('Performance and Reliability Testing', () => {
    it('should handle rapid sequential operations', async () => {
      const service = mockFlintApiService().build();
      await service.initialize();

      // Perform many operations quickly
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(service.getNote(`note-${i}`));
      }

      const results = await Promise.all(operations);
      expect(results).toHaveLength(50);

      // All operations should complete (even if they return null)
      results.forEach(result => {
        expect(result !== undefined).toBe(true);
      });
    });

    it('should handle timeout scenarios', async () => {
      // Note: This test demonstrates timeout handling
      // In real scenarios, you might want to test actual timeouts
      const service = mockFlintApiService().build();
      await service.initialize();

      // Use testUtils to add timeout handling
      const result = await testUtils.waitFor(
        () => service.getNote('test'),
        1000 // 1 second timeout
      );

      expect(result).toBeDefined();
    });

    it('should handle service reconnection', async () => {
      const service = mockFlintApiService().build();

      // Initial connection
      await service.initialize();
      expect(service.isReady()).toBe(true);

      // Test operations work
      const note1 = await service.getNote('test');
      expect(note1).toBeDefined();

      // Reconnect
      await service.reconnect();
      expect(service.isReady()).toBe(true);

      // Test operations still work after reconnection
      const note2 = await service.getNote('test');
      expect(note2).toBeDefined();
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should simulate daily note workflow', async () => {
      const service = mockFlintApiService().build();
      await service.initialize();

      // Create today's daily note
      const today = new Date().toISOString().split('T')[0];
      const dailyNoteId = `daily-${today}`;

      const createResult = await service.createSimpleNote(
        'daily',
        dailyNoteId,
        `# Daily Note - ${today}\n\n## Tasks\n- [ ] Review emails\n- [ ] Team standup\n\n## Notes\n`
      );
      expect(createResult.success).toBe(true);

      // Update the note with progress
      const updatedContent = `# Daily Note - ${today}\n\n## Tasks\n- [x] Review emails\n- [ ] Team standup\n\n## Notes\n- Completed email review at 9 AM\n`;

      const updateResult = await service.updateNoteContent(dailyNoteId, updatedContent);
      expect(updateResult.success).toBe(true);

      // Search for recent daily notes
      const recentDailies = await service.searchNotes('daily', {
        type_filter: 'daily',
        limit: 7
      });
      expect(recentDailies.notes).toBeDefined();
    });

    it('should simulate meeting note workflow', async () => {
      const service = mockFlintApiService().build();
      await service.initialize();

      // Create meeting note
      const meetingId = 'meeting-sprint-planning-2024-01-15';
      const meetingContent = `# Sprint Planning - Jan 15, 2024

## Attendees
- Alice (Product Manager)
- Bob (Tech Lead)
- Charlie (Developer)

## Agenda
1. Review last sprint
2. Plan upcoming sprint
3. Discuss blockers

## Action Items
- [ ] Alice: Finalize user stories
- [ ] Bob: Review technical debt tickets
- [ ] Charlie: Set up testing environment

## Next Meeting
Sprint Retrospective - Jan 29, 2024`;

      const createResult = await service.createSimpleNote('meeting', meetingId, meetingContent);
      expect(createResult.success).toBe(true);

      // Search for all meeting notes
      const allMeetings = await service.searchNotes('meeting', {
        type_filter: 'meeting'
      });
      expect(allMeetings.notes).toBeDefined();

      // Search for notes mentioning specific people
      const aliceNotes = await service.searchNotes('Alice');
      expect(aliceNotes.notes).toBeDefined();
    });

    it('should simulate project management workflow', async () => {
      const service = mockFlintApiService().build();
      await service.initialize();

      // Create project overview note
      const projectId = 'project-user-dashboard-v2';
      const projectContent = `# User Dashboard v2

## Overview
Redesign of the main user dashboard with improved UX and performance.

## Status
🟡 In Progress

## Timeline
- Start: January 1, 2024
- Beta: February 15, 2024
- Release: March 1, 2024

## Team
- Product: Alice
- Engineering: Bob, Charlie
- Design: Diana

## Features
- [ ] Responsive design
- [ ] Dark mode support
- [x] Performance improvements
- [ ] Accessibility enhancements

## Links
- [Design Mockups](link-to-designs)
- [Technical Spec](link-to-spec)
- [Project Board](link-to-board)`;

      const createResult = await service.createSimpleNote('project', projectId, projectContent);
      expect(createResult.success).toBe(true);

      // Update project status
      const updatedContent = projectContent.replace('🟡 In Progress', '🟢 On Track');
      const updateResult = await service.updateNoteContent(projectId, updatedContent);
      expect(updateResult.success).toBe(true);

      // Search for all active projects
      const activeProjects = await service.searchNotesAdvanced({
        type: 'project',
        content_contains: 'In Progress'
      });
      expect(activeProjects.notes).toBeDefined();
    });
  });

  describe('Error Recovery Patterns', () => {
    it('should demonstrate graceful error handling', async () => {
      const service = mockFlintApiService()
        .failNoteOperations(new Error('Network timeout'))
        .build();

      await service.initialize();

      // Operations should fail gracefully
      try {
        await service.getNote('test');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toBe('Network timeout');
      }

      // Service should still be ready for other operations
      expect(service.isReady()).toBe(true);

      // Connection test might still work
      const connectionTest = await service.testConnection();
      expect(connectionTest).toBeDefined();
    });

    it('should test retry patterns', async () => {
      let attemptCount = 0;
      const service = mockFlintApiService().build();

      // Mock getNote to fail first time, succeed second time
      service.getNote = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          id: 'test-note',
          title: 'Test Note',
          content: 'Success after retry'
        });
      });

      await service.initialize();

      // First attempt should fail
      try {
        await service.getNote('test');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toBe('Temporary failure');
      }

      // Second attempt should succeed
      const result = await service.getNote('test');
      expect(result.content).toBe('Success after retry');
      expect(attemptCount).toBe(2);
    });
  });
});
