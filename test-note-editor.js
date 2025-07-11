// Test script for note editor functionality
// This script simulates the note editor workflow for testing

// Mock data for testing
const mockNoteReferences = [
  {
    id: 'note-1',
    title: 'Project Planning',
    type: 'project',
    path: '/vault/projects/project-planning.md'
  },
  {
    id: 'note-2',
    title: 'Daily Standup 2024-01-15',
    type: 'daily',
    path: '/vault/daily/2024-01-15.md'
  },
  {
    id: 'note-3',
    title: 'Meeting Notes - Q1 Review',
    type: 'meeting',
    path: '/vault/meetings/q1-review.md'
  },
  {
    id: 'note-4',
    title: 'Feature Ideas',
    type: 'idea',
    path: '/vault/ideas/feature-ideas.md'
  }
];

const mockNoteContent = {
  'note-1': `# Project Planning

## Overview
This is a comprehensive project planning document for the new feature development.

## Objectives
- Define project scope
- Establish timeline
- Identify resources needed
- Set milestones

## Timeline
- Week 1: Research and analysis
- Week 2: Design and prototyping
- Week 3-4: Development
- Week 5: Testing and deployment

## Resources
- 2 Frontend developers
- 1 Backend developer
- 1 Designer
- 1 QA engineer

## Milestones
1. Requirements gathering complete
2. Design approval
3. MVP development complete
4. Testing phase complete
5. Production deployment`,

  'note-2': `# Daily Standup - January 15, 2024

## What I did yesterday
- Completed user authentication module
- Fixed bug in file upload component
- Code review for PR #123

## What I'm doing today
- Implement note editor component
- Add responsive layout support
- Write unit tests for new features

## Blockers
- None at the moment

## Notes
- Team meeting at 3 PM
- Deploy to staging environment scheduled for tomorrow`,

  'note-3': `# Meeting Notes - Q1 Review

**Date:** January 15, 2024
**Attendees:** John, Sarah, Mike, Lisa
**Duration:** 1 hour

## Agenda
1. Q1 Goals Review
2. Progress Updates
3. Challenges and Solutions
4. Q2 Planning

## Q1 Goals Review
- ✅ User authentication system
- ✅ File management features
- ⏳ Advanced search functionality (80% complete)
- ❌ Mobile app (delayed to Q2)

## Progress Updates
- Frontend: 90% complete
- Backend: 85% complete
- Testing: 70% complete
- Documentation: 60% complete

## Challenges
- Performance optimization needed
- Mobile responsive design issues
- Third-party API integration complexity

## Action Items
- [ ] Optimize database queries (Mike)
- [ ] Fix mobile layout issues (Sarah)
- [ ] Complete API documentation (John)
- [ ] Schedule Q2 planning meeting (Lisa)`,

  'note-4': `# Feature Ideas

## High Priority
- [ ] Real-time collaboration
- [ ] Advanced search with filters
- [ ] Export to multiple formats
- [ ] Mobile application

## Medium Priority
- [ ] Plugin system
- [ ] Themes and customization
- [ ] Backup and sync
- [ ] Advanced permissions

## Low Priority
- [ ] AI-powered suggestions
- [ ] Voice notes
- [ ] Offline mode
- [ ] Integration with external tools

## Implementation Notes
- Focus on user experience
- Ensure scalability
- Maintain performance
- Keep security in mind

## User Feedback
- "Love the current interface, but need mobile support"
- "Export functionality is crucial for our workflow"
- "Real-time collaboration would be game-changing"
- "Plugin system would allow for customization"`
};

// Mock MCP client for testing
class MockMCPClient {
  async callTool(toolCall) {
    console.log('Mock MCP Tool Call:', toolCall);

    const { name, arguments: args } = toolCall;

    switch (name) {
      case 'get_note':
        return this.handleGetNote(args);
      case 'update_note':
        return this.handleUpdateNote(args);
      default:
        return {
          success: false,
          error: `Unknown tool: ${name}`
        };
    }
  }

  async handleGetNote(args) {
    const { title } = args;
    console.log(`Loading note: ${title}`);

    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find note by title
    const note = mockNoteReferences.find(n => n.title === title);
    if (!note) {
      return {
        success: false,
        error: `Note not found: ${title}`
      };
    }

    const content = mockNoteContent[note.id];
    if (!content) {
      return {
        success: false,
        error: `Content not found for note: ${title}`
      };
    }

    return {
      success: true,
      result: {
        content: content,
        title: note.title,
        type: note.type,
        path: note.path
      }
    };
  }

  async handleUpdateNote(args) {
    const { title, content } = args;
    console.log(`Saving note: ${title}, Content length: ${content.length}`);

    // Simulate save delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Find note by title
    const note = mockNoteReferences.find(n => n.title === title);
    if (!note) {
      return {
        success: false,
        error: `Note not found: ${title}`
      };
    }

    // Update mock content
    mockNoteContent[note.id] = content;

    return {
      success: true,
      result: {
        title: note.title,
        saved: true,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Test functions
class NoteEditorTest {
  constructor() {
    this.mcpClient = new MockMCPClient();
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Starting Note Editor Tests');
    console.log('=================================');

    try {
      await this.testNoteLoading();
      await this.testNoteSaving();
      await this.testErrorHandling();
      await this.testMultipleNotes();

      this.printResults();
    } catch (error) {
      console.error('Test runner error:', error);
    }
  }

  async testNoteLoading() {
    console.log('\n📖 Testing Note Loading...');

    for (const note of mockNoteReferences) {
      try {
        const result = await this.mcpClient.callTool({
          name: 'get_note',
          arguments: { title: note.title }
        });

        if (result.success) {
          console.log(`✅ Loaded note: ${note.title}`);
          this.testResults.push({
            test: `Load note: ${note.title}`,
            status: 'PASS'
          });
        } else {
          console.log(`❌ Failed to load note: ${note.title}`);
          this.testResults.push({
            test: `Load note: ${note.title}`,
            status: 'FAIL',
            error: result.error
          });
        }
      } catch (error) {
        console.log(`❌ Error loading note: ${note.title}`);
        this.testResults.push({
          test: `Load note: ${note.title}`,
          status: 'ERROR',
          error: error.message
        });
      }
    }
  }

  async testNoteSaving() {
    console.log('\n💾 Testing Note Saving...');

    for (const note of mockNoteReferences) {
      try {
        const newContent = mockNoteContent[note.id] + '\n\n## Test Update\nThis is a test update.';

        const result = await this.mcpClient.callTool({
          name: 'update_note',
          arguments: {
            title: note.title,
            content: newContent
          }
        });

        if (result.success) {
          console.log(`✅ Saved note: ${note.title}`);
          this.testResults.push({
            test: `Save note: ${note.title}`,
            status: 'PASS'
          });
        } else {
          console.log(`❌ Failed to save note: ${note.title}`);
          this.testResults.push({
            test: `Save note: ${note.title}`,
            status: 'FAIL',
            error: result.error
          });
        }
      } catch (error) {
        console.log(`❌ Error saving note: ${note.title}`);
        this.testResults.push({
          test: `Save note: ${note.title}`,
          status: 'ERROR',
          error: error.message
        });
      }
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');

    // Test loading non-existent note
    try {
      const result = await this.mcpClient.callTool({
        name: 'get_note',
        arguments: { title: 'Non-existent Note' }
      });

      if (!result.success) {
        console.log('✅ Error handling works for non-existent note');
        this.testResults.push({
          test: 'Error handling - non-existent note',
          status: 'PASS'
        });
      } else {
        console.log('❌ Error handling failed for non-existent note');
        this.testResults.push({
          test: 'Error handling - non-existent note',
          status: 'FAIL'
        });
      }
    } catch (error) {
      console.log('❌ Unexpected error in error handling test');
      this.testResults.push({
        test: 'Error handling - non-existent note',
        status: 'ERROR',
        error: error.message
      });
    }

    // Test unknown tool
    try {
      const result = await this.mcpClient.callTool({
        name: 'unknown_tool',
        arguments: {}
      });

      if (!result.success) {
        console.log('✅ Error handling works for unknown tool');
        this.testResults.push({
          test: 'Error handling - unknown tool',
          status: 'PASS'
        });
      } else {
        console.log('❌ Error handling failed for unknown tool');
        this.testResults.push({
          test: 'Error handling - unknown tool',
          status: 'FAIL'
        });
      }
    } catch (error) {
      console.log('❌ Unexpected error in unknown tool test');
      this.testResults.push({
        test: 'Error handling - unknown tool',
        status: 'ERROR',
        error: error.message
      });
    }
  }

  async testMultipleNotes() {
    console.log('\n🔄 Testing Multiple Notes...');

    // Test loading multiple notes quickly
    const promises = mockNoteReferences.map(note =>
      this.mcpClient.callTool({
        name: 'get_note',
        arguments: { title: note.title }
      })
    );

    try {
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;

      if (successCount === mockNoteReferences.length) {
        console.log('✅ Multiple notes loaded successfully');
        this.testResults.push({
          test: 'Multiple notes loading',
          status: 'PASS'
        });
      } else {
        console.log(`❌ Only ${successCount}/${mockNoteReferences.length} notes loaded`);
        this.testResults.push({
          test: 'Multiple notes loading',
          status: 'FAIL',
          error: `Only ${successCount}/${mockNoteReferences.length} notes loaded`
        });
      }
    } catch (error) {
      console.log('❌ Error loading multiple notes');
      this.testResults.push({
        test: 'Multiple notes loading',
        status: 'ERROR',
        error: error.message
      });
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary');
    console.log('=======================');

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const errors = this.testResults.filter(r => r.status === 'ERROR').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🚨 Errors: ${errors}`);
    console.log(`📊 Total: ${this.testResults.length}`);

    if (failed > 0 || errors > 0) {
      console.log('\n💥 Failed/Error Tests:');
      this.testResults
        .filter(r => r.status !== 'PASS')
        .forEach(result => {
          console.log(`- ${result.test}: ${result.status}`);
          if (result.error) {
            console.log(`  Error: ${result.error}`);
          }
        });
    }

    console.log('\n🎉 Tests completed!');
  }
}

// Performance test
class PerformanceTest {
  async runPerformanceTests() {
    console.log('\n⚡ Performance Tests');
    console.log('===================');

    const mcpClient = new MockMCPClient();

    // Test note loading performance
    console.time('Note Loading Performance');
    for (let i = 0; i < 10; i++) {
      await mcpClient.callTool({
        name: 'get_note',
        arguments: { title: mockNoteReferences[0].title }
      });
    }
    console.timeEnd('Note Loading Performance');

    // Test note saving performance
    console.time('Note Saving Performance');
    for (let i = 0; i < 10; i++) {
      await mcpClient.callTool({
        name: 'update_note',
        arguments: {
          title: mockNoteReferences[0].title,
          content: `Test content ${i}`
        }
      });
    }
    console.timeEnd('Note Saving Performance');

    // Test concurrent operations
    console.time('Concurrent Operations');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(mcpClient.callTool({
        name: 'get_note',
        arguments: { title: mockNoteReferences[i % mockNoteReferences.length].title }
      }));
    }
    await Promise.all(promises);
    console.timeEnd('Concurrent Operations');
  }
}

// Run tests
async function runAllTests() {
  const noteEditorTest = new NoteEditorTest();
  await noteEditorTest.runTests();

  const performanceTest = new PerformanceTest();
  await performanceTest.runPerformanceTests();
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NoteEditorTest,
    PerformanceTest,
    runAllTests,
    mockNoteReferences,
    mockNoteContent
  };
}

// Run tests if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  runAllTests().catch(console.error);
}
