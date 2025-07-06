# Model Training Examples for flint-note

This document provides specific training examples and test scenarios for AI models working with flint-note. Use these examples to validate model behavior and ensure consistent performance.

## Training Example Sets

### Example Set 1: Basic Mood Logging

**Scenario**: User wants to log emotional state
**Expected Workflow**: Check vault → Check note types → Check agent instructions → Use/create mood type → Create note → Follow agent instructions

#### Example 1A: First time mood logging
**User Input**: "log I'm feeling happy today"

**Expected Model Response**:
```
Let me check your current vault and note types to see how you track feelings...
[Calls: get_current_vault]
I'm working in your personal vault - perfect for mood tracking.
[Calls: list_note_types]
I don't see a mood tracking system yet. Should I create a 'mood' note type that will ask about triggers, intensity, and coping strategies for your feelings?
[Waits for user confirmation]
Great! I'll create the mood tracking system for you.
[Calls: create_note_type with name="mood" and agent_instructions="When creating mood notes, ask about what triggered this feeling, rate intensity 1-10, and suggest ways to maintain or improve the mood."]
Now I'll log that you're feeling happy today.
[Calls: create_note with type="mood" and content about being happy, including wikilinks like "[[wellness/gratitude-practice|Gratitude Practice]]"]
I've created your mood note and the system automatically detected and indexed the wikilinks in your content. The link extraction found connections to your _Gratitude Practice_ and _Yesterday's reflection_ notes.
[The system automatically extracts and stores all wikilinks from the note content]
What triggered this happy feeling today? And on a scale of 1-10, how intense is this happiness?
```

#### Example 1B: Subsequent mood logging
**User Input**: "feeling stressed about work"

**Expected Model Response** (assuming mood type exists):
```
Let me add this to your mood tracking...
[Calls: get_current_vault]
[Calls: list_note_types - sees mood type exists]
[Calls: get_note_type_info for mood type to check agent instructions]
Based on your mood tracking preferences, I'll capture this stress and ask about triggers and coping strategies.
[Calls: create_note with type="mood" following agent instructions, including wikilinks like "[[work/current-workload|Current Workload]]"]
I've created your stress note and the automatic link extraction system found and indexed the wikilinks in your content, connecting to your _Current Workload_ and _Stress Management Techniques_ notes.
[The system automatically extracts and stores all wikilinks from the note content]
What specifically about work is causing this stress? On a scale of 1-10, how intense is this feeling? What's one thing you could do right now to help manage it?
```

### Example Set 2: Meeting Documentation

**Scenario**: User mentions meetings or calls
**Expected Workflow**: Check vault → Check note types → Check agent instructions → Use/create meeting type → Extract attendees/topics → Follow agent instructions

#### Example 2A: Basic meeting mention
**User Input**: "had a standup with the team today"

**Expected Model Response**:
```
I'll document that team standup for you.
[Calls: get_current_vault]
You're in your work vault - perfect for team meetings.
[Calls: list_note_types]
[Calls: get_note_type_info for meeting type to check agent instructions]
Based on your meeting note preferences, I'll capture attendees and key updates.
[Calls: create_note with type="meeting" following agent instructions]
[Calls: search_notes with query="standup team meeting"]
I found related project notes and previous standups - I've linked to your _Current Sprint_ and _Yesterday's Standup_ notes for context.
Who attended the standup? What were the key updates and any blockers discussed?
```

### Example Set 3: Multi-Vault Management

**Scenario**: User wants to organize notes across different contexts
**Expected Workflow**: Create vaults → Switch contexts → Adapt behavior per vault

#### Example 3A: Initial vault setup
**User Input**: "I want to separate my work and personal notes"

**Expected Model Response**:
```
That's a great way to organize! I'll help you set up separate vaults for better organization.
[Calls: list_vaults to see current setup]
I'll create dedicated vaults for work and personal contexts.
[Calls: create_vault with vault_id="work", name="Work Notes", description="Professional projects and meetings"]
[Calls: create_vault with vault_id="personal", name="Personal Notes", description="Personal goals and interests"]
Perfect! You now have:
- Work vault: For professional content
- Personal vault: For personal interests and goals

Which vault would you like to start with?
```

#### Example 3B: Vault switching
**User Input**: "switch to my work vault and create a project note"

**Expected Model Response**:
```
I'll switch you to your work vault now.
[Calls: switch_vault with vault_id="work"]
Switched to your work vault. I can see this focuses on professional projects.
[Calls: list_note_types]
[Calls: get_note_type_info for project type to check agent instructions]
Based on your project note setup, I'll capture project details and track milestones.
[Calls: create_note with type="project" following agent instructions]
What's the project name and main objectives? I'll structure this according to your work project guidelines.
```

#### Example 3C: Vault-aware behavior
**User Input**: "I'm feeling stressed"

**Context**: Currently in work vault

**Expected Model Response**:
```
[Calls: get_current_vault - sees "work" vault]
Since you're in your work vault, this might be work-related stress. Would you like me to create a mood note here, or would you prefer to switch to your personal vault for this type of reflection?
[Waits for user preference]
[Creates note in appropriate vault based on user choice]
```

### Example Set 4: Cross-Vault Intelligence

**Scenario**: User asks about information that might span vaults
**Expected Workflow**: Understand context → Search appropriately → Respect vault boundaries

#### Example 4A: Context-aware search
**User Input**: "What did we decide about the authentication system?"

**Expected Model Response**:
```
[Calls: get_current_vault - confirms work context]
[Calls: search_notes with query="authentication" scoped to current vault]
I found 3 relevant decisions connected through your note links: [[meeting-notes/2024-03-15-architecture|March 15 architecture meeting]] chose OAuth 2.0, [[meeting-notes/2024-03-20-security-review|March 20 security review]] approved it, and [[technical-specs/auth-implementation|March 22 implementation spec]] completed. I can trace the full decision chain through your linked notes - would you like the detailed rationale?
```

#### Example 4B: Vault boundary respect
**User Input**: "Show me all my meeting notes"

**Expected Model Response**:
```
[Calls: get_current_vault]
I'll show you meeting notes from your current work vault. I can see you have other vaults (personal, research) - would you like me to search those as well, or focus on work meetings?
[Based on response, searches appropriate vaults]
```

### Example Set 5: Multi-Note Operations and Performance Optimization

**Scenario**: User wants to work with multiple notes efficiently
**Expected Workflow**: Use get_notes → Apply field filtering → Optimize performance

#### Example 5A: Fetching multiple specific notes
**User Input**: "Show me my three main project notes"

**Expected Model Response**:
```
I'll fetch your main project notes efficiently in a single call.
[Calls: get_notes with identifiers=["project/web-app.md", "project/mobile-app.md", "project/api-redesign.md"]]
Here are your three main projects:
- _Web Application Redesign_: In progress, due next month
- _Mobile App Development_: Planning phase, team assigned
- _API Redesign_: Blocked, waiting for architecture approval

Which project would you like to focus on?
```

#### Example 5B: Performance optimization with field filtering
**User Input**: "Just show me the titles and status of all my project notes"

**Expected Model Response**:
```
I'll get just the titles and status to keep this fast and focused.
[Calls: search_notes_advanced with type_filter="project" and fields=["title", "metadata.status"]]
Here are your 8 project notes with current status (reduced data transfer by 85%):
- _Web Redesign_: In Progress
- _Mobile App_: Planning
- _API Redesign_: Blocked
- _Documentation Update_: Completed
- _Performance Optimization_: Not Started
- _Security Audit_: In Progress
- _User Testing_: Completed
- _Code Review Process_: In Progress

This targeted approach loaded only essential data. Which projects need attention?
```

#### Example 5C: Bulk editing preparation
**User Input**: "I need to update the status on several project notes"

**Expected Model Response**:
```
I'll prepare those projects for bulk status updates.
[Calls: search_notes_advanced with type_filter="project" and fields=["id", "title", "content_hash", "metadata.status"]]
I've loaded 8 project notes with their current status and content hashes for safe updating:
- _Web Redesign_ (hash: abc123): Currently "In Progress"
- _Mobile App_ (hash: def456): Currently "Planning"
- _API Redesign_ (hash: ghi789): Currently "Blocked"
[... continues with all projects]

All content hashes are captured for conflict-free updates. Which projects need status changes?
```

#### Example 5D: Efficient note linking analysis
**User Input**: "Check what my reading notes link to"

**Expected Model Response**:
```
I'll analyze your reading notes' connections efficiently.
[Calls: search_notes_advanced with type_filter="reading" and fields=["id", "title"]]
[Calls: get_notes with the reading note identifiers and fields=["title", "metadata.tags"]]
Found 12 reading notes. Now checking their link patterns...
[Calls: get_note_links for each reading note]
Your reading notes show strong connection patterns:
- _Atomic Habits_ links to 5 productivity notes
- _Deep Work_ connects to 3 focus technique notes  
- _Thinking Fast and Slow_ links to 4 decision-making notes

The link analysis shows you're building a knowledge network around productivity and decision-making. Would you like me to suggest additional connections?
```

### Example Set 6: Link Management System

**Scenario**: User wants to analyze or manage links between notes
**Expected Workflow**: Use appropriate link tools → Explain relationships → Suggest actions

#### Example 6A: Basic link analysis
**User Input**: "show me what's connected to my project note"

**Expected Model Response**:
```
Let me analyze all the connections to your project note.
[Calls: get_note_links with identifier="projects/website-redesign"]
Your project note has rich connections:
- **Outgoing links**: Links to 4 other notes including your _Design System_ and _User Research_ notes
- **Incoming links**: Referenced by 3 notes including last week's _Team Meeting_ and your _Q1 Goals_
- **External links**: 2 URLs to design inspiration sites

The link analysis shows this is a well-connected project with clear relationships to your broader work. Would you like me to show you the specific notes or check for any broken links?
```

#### Example 5B: Broken link maintenance
**User Input**: "check for broken links"

**Expected Model Response**:
```
I'll scan your vault for broken wikilinks.
[Calls: find_broken_links]
Found 2 broken links that need attention:
1. **daily-notes/2024-01-10** → Links to "missing-book" (line 8) - possibly a reading note that was never created?
2. **projects/website** → Links to "old-mockups" (line 15) - might be referring to a renamed or deleted note

Would you like me to help fix these? I can suggest existing notes that might match, or we can create the missing notes.
```

#### Example 5C: Link relationship search
**User Input**: "find all notes that link to my Atomic Habits reading"

**Expected Model Response**:
```
Let me find everything connected to your Atomic Habits note.
[Calls: get_backlinks with identifier="reading-notes/atomic-habits"]
Your _Atomic Habits_ note is referenced by 5 other notes:
- **daily-notes/2024-01-12**: Applied habit stacking technique
- **projects/morning-routine**: References the 4-step habit loop
- **goals/2024-health**: Links to habit formation principles
- **daily-notes/2024-01-18**: Mentioned identity-based habits
- **reading-notes/tiny-habits**: Compares approaches to habit formation

This shows _Atomic Habits_ is a key reference in your habit formation thinking. The automatic link extraction has been tracking these connections as you write. Would you like to see the specific context where each note references it?
```

#### Example 5D: Advanced link search
**User Input**: "show me notes that link to external GitHub repos"

**Expected Model Response**:
```
I'll search for notes with GitHub links.
[Calls: search_by_links with external_domains=["github.com"]]
Found 4 notes with GitHub repository links:
- **projects/website-redesign**: Links to 2 GitHub repos (UI components, deployment scripts)
- **learning/javascript-tutorial**: References 3 example repositories
- **daily-notes/2024-01-20**: Bookmarked an interesting React library
- **projects/api-documentation**: Links to the main project repository

The link extraction system automatically categorized these as external links and indexed them by domain. This gives you a clear view of your code-related resources across all notes.
```

#### Example 5E: Automatic link extraction in action
**User Input**: "Create a project note about building a mobile app, and mention it connects to my React learning and UI design research"

**Expected Model Response**:
```
I'll create a project note and establish those connections.
[Calls: get_current_vault]
[Calls: list_note_types]
[Calls: get_note_type_info for project type]
[Calls: create_note with type="project", content including "This builds on my [[learning/react-fundamentals|React learning]] and connects to my [[research/mobile-ui-patterns|UI design research]]"]
Perfect! I've created your mobile app project note and included wikilinks to your React learning and UI design research. The automatic link extraction system has already:
- **Indexed the wikilinks**: Both connections are now stored in the link database
- **Created relationships**: Your React and UI research notes now show incoming links from this project
- **Enabled discovery**: You can now find this project when searching for React or UI-related work

The link system will continue tracking connections as you add more content to any of these notes. Would you like me to check what other notes might be relevant to link to this project?
```

### Example Set 6: Vault-Specific Agent Instructions

**Scenario**: Different note types behave differently based on vault context
**Expected Workflow**: Check vault → Apply vault-specific agent instructions → Adapt behavior

#### Example 5A: Work vault meeting notes
**User Input**: "document today's client meeting"
**Context**: In work vault

**Expected Model Response**:
```
[Calls: get_current_vault - confirms work vault]
[Calls: get_note_type_info for "meeting" in work vault]
I'll create a client meeting note following your professional documentation standards.
[Calls: create_note]
[Calls: search_notes with query="client meeting project"]
I found related client and project notes - I've linked to [[client-notes/acme-corp|ACME Corp Profile]] and [[project-notes/q1-deliverables|Q1 Deliverables]] to provide context.
Based on your work meeting guidelines, I should capture: client objectives, key decisions, action items with owners, and next steps. What was the main purpose of today's meeting?
```

#### Example 5B: Personal vault meeting notes  
**User Input**: "had coffee with Sarah"
**Context**: In personal vault

**Expected Model Response**:
```
[Calls: get_current_vault - confirms personal vault]
[Calls: get_note_type_info for social/meeting equivalent in personal vault]
I'll create a note about your time with Sarah. 
[Calls: create_note]
[Calls: search_notes with query="Sarah friend social"]
I found previous notes about Sarah - I've linked to [[people-notes/sarah|Sarah's Profile]] and [[social-notes/2024-01-05-sarah-birthday|Sarah's Birthday Celebration]] to maintain your social connection history.
Since this is in your personal vault, I'll focus on the social connection rather than formal meeting structure. What did you and Sarah catch up about?
```

### Example Set 6: Vault Creation Patterns

#### Example 6A: Professional consultant setup
**User Input**: "I'm a consultant and need to keep client work separate"

**Expected Model Response**:
```
Perfect - client confidentiality is crucial for consultants. I'll help you create a vault structure that maintains clear boundaries.
[Calls: create_vault for each client and business functions]
I recommend this structure:
- Business vault: Your general business operations
- Client-A vault: All Client A materials (confidential)
- Client-B vault: All Client B materials (confidential)
- Methodologies vault: Reusable processes and methodologies

Each client vault will have completely separate note types and agent instructions. Would you like me to set these up?
```

#### Example 6B: Academic researcher setup
**User Input**: "I'm a PhD student and need to organize research, coursework, and personal stuff"

**Expected Model Response**:
```
Great! Academic work benefits from clear organization across different contexts.
[Calls: create_vault for academic contexts]
I'll create:
- Dissertation vault: Your main research project
- Coursework vault: Classes, assignments, and teaching
- Research vault: General research and paper reading
- Personal vault: Non-academic interests and goals

Each vault will have note types optimized for that academic context. Your dissertation vault will focus on research methodology and findings, while coursework will emphasize learning and teaching materials.
```

### Example Set 7: Enhanced Wikilink Workflows

**Scenario**: User mentions topics that should be linked to existing notes
**Expected Workflow**: Create note → Find linkable content → Add wikilinks → Sync metadata

#### Example 7A: Automatic link discovery
**User Input**: "I'm reading Atomic Habits and applying it to my productivity system"

**Expected Model Response**:
```
[Calls: get_current_vault]
[Calls: create_note with type="reading" or appropriate type]
[Calls: search_notes with query="atomic habits productivity"]
I found several related notes! I've created your reading note and linked it to [[reading-notes/atomic-habits|Atomic Habits]] (if you have previous notes) and [[project-notes/productivity-system|Productivity System Project]].
The content now includes intelligent links to your related notes. What specific techniques from Atomic Habits are you applying to your system?
```

#### Example 7B: Link validation and repair
**User Input**: "Update my project note with current status"

**Expected Model Response**:
```
[Calls: get_note with project identifier]
[Calls: find_broken_links]
I notice some of your project links may be outdated. I found 2 broken links to [[team-notes/old-sprint|Old Sprint]] and [[resources/deprecated-guide|Deprecated Guide]].
[Shows suggestions for repairs]
Would you like me to update these to [[team-notes/current-sprint|Current Sprint]] and [[resources/updated-guide|Updated Guide]] instead?
[Updates content with user approval]
Your project note is now updated with current information and working links.
```

#### Example 7C: Smart link suggestions
**User Input**: "Create a note about my morning routine"

**Expected Model Response**:
```
[Calls: create_note with type="daily" or "habits"]
[Calls: search_notes with query="morning routine habits"]
I've created your morning routine note. I noticed you have related notes about [[habits/meditation-practice|Meditation Practice]], [[health/exercise-routine|Exercise Routine]], and [[productivity/morning-planning|Morning Planning]]. 
Should I connect this routine note to these existing habits and practices? This will help you see how your morning routine connects to your broader life systems.
```

#### Example 7D: Link report analysis
**User Input**: "How well connected are my project notes?"

**Expected Model Response**:
```
[Calls: search_notes with type_filter="project"]
Let me analyze the connectivity of your project notes...
[Calls: search_by_links with various criteria to analyze connectivity]
[Calls: find_broken_links]
Here's your project connectivity analysis:
- 5 project notes with 12 total links
- 8 valid connections, 1 broken link
- 3 notes have no connections (potential isolation)
- Link density: 0.08 (moderate connectivity)

Recommendations:
- Fix broken link in [[project-notes/website-redesign|Website Project]]
- Consider connecting isolated notes to the main project ecosystem
- Your _Product Launch_ note could link to _Marketing Strategy_ and _Development Timeline_

Would you like me to help establish these connections or fix the broken link?
Would you like me to help strengthen these connections?
```

## Required Link Management System Validation Tests

Test these scenarios to ensure proper automatic link extraction functionality:

#### Test 1: Automatic Link Extraction
**Input**: Create note with wikilinks in content
**Expected**: All links automatically extracted and indexed
**Validation**: 
- ✅ Wikilinks use `[[type/filename|Display]]` format in content
- ✅ System automatically extracts links during create/update operations
- ✅ Links stored in SQLite database with line numbers
- ✅ Both internal wikilinks and external URLs extracted

#### Test 2: Link Analysis Workflow
**Input**: User asks about note connections
**Expected**: System uses link management tools effectively
**Validation**:
- ✅ Uses `get_note_links` for comprehensive link analysis
- ✅ Uses `get_backlinks` to find incoming references
- ✅ Uses `find_broken_links` for maintenance needs
- ✅ Uses `search_by_links` for relationship queries

#### Test 3: Automatic Link Resolution
**Input**: Note with wikilinks created or updated
**Expected**: Links automatically resolved to note IDs
**Validation**:
- ✅ Wikilinks resolved to actual note IDs in database
- ✅ Broken links tracked with target_note_id = NULL
- ✅ Automatic resolution when target notes are created/renamed
- ✅ Link relationships updated in real-time

#### Test 4: Link Validation and Repair
**Input**: Content with broken or invalid wikilinks
**Expected**: System identifies issues and suggests fixes
**Validation**:
- ✅ Calls `find_broken_links`
- ✅ Identifies broken links
- ✅ Provides repair suggestions

#### Test 5: Auto-Enhancement
**Input**: Plain text mentioning existing topics
**Expected**: System suggests wikilink additions
**Validation**:
- ✅ Searches for relevant connections
- ✅ Suggests intelligent links
- ✅ Maintains proper format

### Standard Validation Checkpoints

**Model MUST demonstrate**:
1. ✅ Always calls `get_current_vault` to understand context
2. ✅ Always calls `list_note_types` before creating notes
3. ✅ Always asks user permission before creating new note types
4. ✅ Always follows agent instructions from responses
5. ✅ Always calls `search_notes` before creating wikilinks
6. ✅ Always uses [[type/filename|Display]] format for wikilinks
7. ✅ Links are automatically tracked in the system
8. ✅ Uses `find_broken_links` to identify link issues
9. ✅ Provides link suggestions for relevant connections
10. ✅ Maintains vault-aware behavior across all operations

**Enhanced Linking Requirements**:
- ✅ Searches for linkable content before creating connections
- ✅ Uses proper wikilink format consistently
- ✅ Syncs wikilinks to frontmatter metadata
- ✅ Validates links and suggests repairs
- ✅ Provides intelligent auto-linking suggestions
- ✅ Generates link reports for connectivity analysis
- ✅ Respects vault boundaries when linking
- ✅ Considers context when suggesting connections

**Conversation Quality**:
- ✅ Maintains natural, helpful tone
- ✅ Explains actions clearly to users
- ✅ Asks clarifying questions when needed
- ✅ Provides proactive suggestions
- ✅ Adapts behavior based on vault context
- ✅ Shows understanding of user workflows

**Error Handling**:
- ✅ Gracefully handles missing notes
- ✅ Provides helpful error messages
- ✅ Suggests alternatives when operations fail
- ✅ Validates inputs before processing
- ✅ Offers repair suggestions for broken links

**Success Metrics for Deployment**:
- 95%+ success rate on vault context awareness
- 95%+ success rate on note type checking
- 100% user permission requests for new note types
- 90%+ proper wikilink format usage
- 85%+ successful link discovery and creation
- 95%+ frontmatter synchronization accuracy
- User satisfaction with natural conversation flow
- Demonstrated improvement in note connectivity over time

Use these validation scenarios to test any flint-note AI integration before deployment. Each scenario should pass consistently to ensure reliable user experience.

**Additional Vault Requirements**:
- ✅ Adapts note creation based on vault purpose
- ✅ Respects vault boundaries in search operations
- ✅ Suggests appropriate vault switches when needed
- ✅ Creates vaults with meaningful purposes and descriptions
- ✅ Uses vault-specific agent instructions appropriately
- ✅ Maintains conversational tone while being vault-aware

**Model MUST NOT**:
- ❌ Create notes without checking vault context
- ❌ Mix vault contexts inappropriately
- ❌ Ignore vault boundaries in suggestions
- ❌ Create vaults without understanding user's organizational needs
- ❌ Use identical behavior across different vault contexts
- ❌ Create wikilinks to non-existent notes
- ❌ Use incorrect wikilink format
- ❌ Skip link validation and synchronization

### Advanced Vault Scenarios

#### Scenario A: Cross-vault project
**User Input**: "This work project relates to my research - should I link them?"

**Expected Model Response**:
```
Interesting connection! Since these are in different vaults (work and research), I should respect those boundaries while still helping you track the connection.

Options:
1. Create reference notes in each vault pointing to the other
2. Use tags that span vaults for later discovery
3. Create a summary note in a shared context if appropriate

What type of connection exists between your work project and research?
```

#### Scenario B: Vault consolidation
**User Input**: "I think I created too many vaults - can I merge some?"

**Expected Model Response**:
```
Let me show you your current vault structure...
[Calls: list_vaults]
You have: work, personal, research, temp-project, notes-backup

I can see some potential consolidation opportunities. For example, 'temp-project' might fit better in your work vault, and 'notes-backup' seems like a duplicate.

Would you like me to help move notes between vaults and clean up the structure?
```

### Error Handling Examples

#### Example E1: Vault switching failure
**User Input**: "switch to my school vault"
**Context**: Vault doesn't exist

**Expected Model Response**:
```
[Calls: switch_vault with vault_id="school" - fails]
I don't see a 'school' vault in your configuration. You currently have: work, personal, research.

Would you like me to:
1. Create a new 'school' vault for academic work
2. Switch to your 'research' vault if that's what you meant
3. Show you all available vaults to choose from
```

#### Example E2: Ambiguous vault context
**User Input**: "create a meeting note"
**Context**: Multiple vaults have meeting types

**Expected Model Response**:
```
[Calls: get_current_vault]
You're currently in your personal vault, but I notice you also have meeting note types in your work vault. 

Is this for a:
- Personal meeting (social, family, personal appointments)
- Work meeting (I can switch you to work vault)
- Other context?

Let me know and I'll create the note in the right vault with appropriate formatting.
```

### Example Set 8: Batch Operations

**Scenario**: User wants to create or update multiple related notes
**Expected Workflow**: Identify batch opportunity → Use batch operations → Handle results → Follow agent instructions

#### Example 8A: Multiple project creation
**User Input**: "Create project notes for Q1: Website Redesign, Mobile App, API Refactor - all due March 31st"

**Expected Model Response**:
```
I'll create all three Q1 project notes at once for you...
[Calls: get_current_vault]
[Calls: list_note_types - finds project type]
[Calls: get_note_type_info for project type to check agent instructions]
Based on your project tracking preferences, I'll include milestones, stakeholders, and deadlines for each project.
[Calls: create_note with notes array containing all 3 projects]
I've successfully created 3 project notes with March 31st deadlines: Website Redesign, Mobile App, and API Refactor. All follow your project template and are linked to your Q1 Planning overview. What are the key milestones for each project?
```

#### Example 8B: Bulk status updates
**User Input**: "Mark all my December projects as completed"

**Expected Model Response**:
```
I'll find and update all your December project notes to completed status...
[Calls: search_notes with date filter for December and type filter for projects]
[Calls: update_note with updates array for all found projects]
I successfully updated 4 out of 5 December projects to completed status. The Mobile App project failed because it's missing required completion metadata. I've marked Website Redesign, API Refactor, Database Migration, and Client Portal as completed. Should I help fix the Mobile App project metadata so I can complete that update too?
```

#### Example 8C: Batch import with failures
**User Input**: "Import these meeting notes from my old system: [provides structured data for 5 meetings]"

**Expected Model Response**:
```
I'll batch import these meeting notes and format them according to your meeting preferences...
[Calls: get_note_type_info for meeting type to check agent instructions]
[Calls: create_note with notes array containing all 5 meetings]
I've imported 3 out of 5 meeting notes successfully. 2 failed due to missing attendee information for the March 10th and March 15th meetings. The successfully imported meetings are now linked to your related project notes. Which meetings need attendee information added so I can complete the import?
```

### Complex Workflow Example

**User Input**: "I just started a new job and need to reorganize everything"

**Expected Model Response**:
```
Congratulations on the new job! A fresh start is perfect for reorganizing your knowledge system.

Let me help you create a structure that separates your new work context from personal and any previous work:

[Calls: list_vaults to see current setup]
[Calls: create_vault for new job context]

I recommend:
1. Create 'new-job' vault for your current role
2. Keep existing 'work' vault for general professional knowledge
3. Maintain 'personal' vault for non-work items
4. Archive or rename old job-specific content

Your new-job vault will have note types optimized for onboarding, learning, and building relationships in your new role. What type of work will you be doing?
```

Let me save this meeting information...
[Calls: list_note_types]
I don't see a meeting note type. Should I create one that will automatically track attendees, decisions, and action items?
[Waits for user confirmation]
Perfect! I'll set up meeting tracking for you.
[Calls: create_note_type with name="meeting" and agent_instructions="For meeting notes, extract attendees, key topics, decisions made, and action items. Always ask for missing information about outcomes and next steps."]
[Calls: create_note with type="meeting" and content about standup]
Who attended this standup? What were the main topics discussed? Were there any decisions made or action items assigned?
```

#### Example 2B: Detailed meeting info
**User Input**: "Met with Sarah and John about the API project. We decided to use GraphQL and John will research options by Friday."

**Expected Model Response**:
```
I'll document this API project meeting...
[Calls: list_note_types - finds meeting type]
[Calls: create_note with extracted information: attendees=Sarah,John; topic=API project; decision=use GraphQL; action_item=John research options by Friday]
I've logged the meeting with Sarah and John about the API project. I noted the GraphQL decision and John's research task due Friday. Are there any other outcomes or follow-up actions from this meeting?
```

### Example Set 3: Learning and Knowledge Capture

**Scenario**: User shares something they learned
**Expected Workflow**: Check note types → Use/create learning type → Capture insights → Follow agent instructions

#### Example 3A: Reading mention
**User Input**: "read an interesting article about machine learning"

**Expected Model Response**:
```
Let me help you capture what you learned...
[Calls: list_note_types]
I don't see a reading/learning note type. Should I create one that will capture sources, insights, and connections?
[Waits for user confirmation]
Excellent! I'll create a reading notes system for you.
[Calls: create_note_type with name="reading" and agent_instructions="For reading notes, capture the source, key insights, personal thoughts, and connections to other knowledge. Ask about practical applications."]
[Calls: create_note with type="reading"]
What was the article title or source? What were the key insights about machine learning that interested you? How might you apply this knowledge?
```

#### Example 3B: Learning insight
**User Input**: "Learned that compound interest really is the eighth wonder of the world - the math is incredible"

**Expected Model Response**:
```
[Calls: list_note_types - finds reading/learning type]
I'll save this insight about compound interest...
[Calls: create_note with type="learning" and content about compound interest insight]
That's a powerful realization about compound interest! Where did you learn this - was it from a book, article, or conversation? What specific aspect of the math impressed you most? Are you thinking about applying this insight to any personal financial decisions?
```

### Example Set 4: Project and Work Tracking

**Scenario**: User mentions work progress or projects
**Expected Workflow**: Check note types → Use/create project type → Track status → Follow agent instructions

#### Example 4A: Project mention
**User Input**: "making good progress on the website redesign"

**Expected Model Response**:
```
Let me track this project progress...
[Calls: list_note_types]
I don't see a project tracking system. Should I create a 'project' note type that will track status, milestones, and deadlines?
[Waits for user confirmation]
Great! I'll set up project tracking for you.
[Calls: create_note_type with name="project" and agent_instructions="For project notes, track current status, recent progress, next steps, blockers, and timeline. Always ask about deadlines and dependencies."]
[Calls: create_note with type="project" about website redesign progress]
What specific progress have you made on the website redesign? What are your next steps? Are there any blockers or dependencies I should note? What's your target completion date?
```

### Batch Operations Validation Tests

#### Test 1: Batch Creation Recognition
**Input**: "Create project notes for Website, Mobile App, and API work"
**Expected**: Should recognize batch opportunity and use create_note with notes array, not 3 separate calls

#### Test 2: Batch Update Recognition  
**Input**: "Update all my Q1 projects to completed status"
**Expected**: Should search for Q1 projects, then use update_note with updates array

#### Test 3: Batch Error Handling
**Input**: Batch operation with some failures
**Expected**: Should report success/failure counts and specifically identify failed items with error details

#### Test 4: Mixed Batch Operations
**Input**: "Create 3 project notes and update 2 existing ones to completed"
**Expected**: Should handle as separate batch operations (create batch + update batch) or guide user to clarify

## Common Failure Patterns and Corrections

### Failure Pattern 1: Skipping Note Type Check
**Wrong Approach**:
```
User: "log I'm feeling happy"
Bad Model: [Immediately calls create_note without checking note types]
```

**Correct Approach**:
```
User: "log I'm feeling happy"
Good Model: [Always calls list_note_types first, then proceeds based on what exists]
```

### Failure Pattern 2: Ignoring Agent Instructions
**Wrong Approach**:
```
Model creates note, gets agent_instructions in response, then ignores them and just says "Note created successfully"
```

**Correct Approach**:
```
Model creates note, reads agent_instructions in response, then follows them exactly by asking the specified questions or taking the specified actions
```

### Failure Pattern 3: Not Extracting Information
**Wrong Approach**:
```
User: "Met with Sarah about the budget. She approved the $10k request."
Bad Model: Creates note with just "met with Sarah about budget"
```

**Correct Approach**:
```
User: "Met with Sarah about the budget. She approved the $10k request."
Good Model: Extracts attendees=Sarah, topic=budget, decision=$10k approved, and includes all details in note
```

### Failure Pattern 4: Missing Batch Opportunities
**Wrong Approach**:
```
User: "Create project notes for Website, Mobile App, and API work"
Bad Model: Makes 3 separate create_note calls
```

**Correct Approach**:
```
User: "Create project notes for Website, Mobile App, and API work"
Good Model: Uses single create_note call with notes array containing all 3 projects
```

### Failure Pattern 5: Poor Batch Error Handling
**Wrong Approach**:
```
Batch operation fails partially, model just says "Some notes failed to create"
```

**Correct Approach**:
```
Batch operation fails partially, model reports: "Created 2 out of 3 notes successfully. The Mobile App project failed because it's missing required 'stakeholder' metadata. Should I help fix that so I can complete the creation?"
```

## Validation Test Scenarios

### Test Set A: Cold Start (No Note Types Exist)
1. "log I'm feeling anxious" → Should ask permission, then create mood type, then note
2. "had a call with client" → Should ask permission, then create meeting type, then note  
3. "read a great book" → Should ask permission, then create reading type, then note
4. "working on new feature" → Should ask permission, then create project type, then note

### Test Set B: Warm System (Note Types Exist)
1. "feeling happy today" → Should use existing mood type
2. "standup meeting covered three topics" → Should use existing meeting type
3. "finished reading Atomic Habits" → Should use existing reading type
4. "project milestone completed" → Should use existing project type

### Test Set E: Batch Operations
1. "Create project notes for Website, Mobile App, API work" → Should use batch create_note with notes array
2. "Mark all my Q1 projects as completed" → Should use batch update_note with updates array
3. "Import these 5 meeting notes from my old system" → Should use batch create_note and handle any failures
4. "Update the status on all December projects and add completion dates" → Should use batch update_note with metadata changes

### Test Set C: Edge Cases
1. "not sure what this is" → Should ask clarifying questions
2. "feeling happy about finishing the project after meeting with Sarah" → Should handle multiple concepts
3. Empty or unclear input → Should ask for clarification
4. Very long, complex input → Should extract key information

### Test Set D: Agent Instruction Following
1. Create note, get agent instructions, verify model follows them
2. Agent instructions ask specific questions → Model should ask those questions
3. Agent instructions suggest actions → Model should suggest those actions
4. Agent instructions request information → Model should request that information

## Expected Response Quality Metrics

### Excellent Response Characteristics:
- Always checks note types first
- Extracts all relevant information from user input
- Follows agent instructions completely
- Asks relevant follow-up questions
- Maintains conversational tone
- Explains actions taken
- Uses batch operations efficiently for multiple related notes
- Handles batch operation failures gracefully with specific error details

### Poor Response Characteristics:
- Skips note type checking
- Creates new note types without user permission
- Creates generic notes without structure
- Ignores agent instructions
- Doesn't extract metadata
- Overly technical or robotic tone
- Doesn't explain what it's doing
- Makes multiple individual calls instead of using batch operations
- Ignores batch operation failures or provides vague error messages

## Training Data Validation

Use these prompts to test model understanding:

### Prompt 1: Basic Understanding
"When a user says 'log I'm feeling happy today', what is the first thing you should do?"
**Expected Answer**: "Check what note types exist using list_note_types"

### Prompt 2: Workflow Understanding  
"What are the 4 mandatory steps for every user request?"
**Expected Answer**: "1. Check note types, 2. Read agent instructions, 3. Create/use appropriate note type, 4. Follow agent instructions from response"

### Prompt 3: Agent Instructions Understanding
"After you create a note and get a response with agent_instructions, what should you do?"
**Expected Answer**: "Follow the agent instructions exactly - ask the questions they specify, take the actions they request"

### Prompt 4: Batch Operations Understanding
"When should you use batch operations instead of individual note creation?"
**Expected Answer**: "When creating 3+ related notes, when updating multiple notes with similar changes, when importing data, or when the user explicitly mentions multiple items that can be processed together"

### Prompt 5: Batch Error Handling
"If a batch operation creates 3 notes successfully but 2 fail, what should you tell the user?"
**Expected Answer**: "Report the specific success/failure counts, identify which items failed with specific error messages, and offer to help fix the failed items"

## Advanced Training Scenarios

### Multi-Intent Recognition
**User Input**: "Had a great meeting with Sarah about the new project. Feeling excited about the possibilities!"

**Expected Behavior**:
- Recognize both meeting and mood elements
- Ask user if they want one note or separate notes
- Handle both aspects appropriately
- Follow agent instructions for both note types

### Context Building
**User Input**: "Follow up on yesterday's discussion about the API"

**Expected Behavior**:
- Search for recent API-related notes
- Reference previous context
- Create follow-up note that links to previous discussion
- Ask for specific updates or new information

### Pattern Recognition
**User Input**: Multiple similar requests over time

**Expected Behavior**:
- Recognize patterns in user behavior
- Suggest note type improvements
- Recommend organizational changes
- Adapt agent instructions based on usage

Remember: These examples should be used to train models to be consistent, thorough, and helpful while maintaining the conversational, intelligent assistance that makes flint-note unique.