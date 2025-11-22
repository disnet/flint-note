# Workflow Automation (Routines)

Automate recurring tasks and create reusable workflows with Flint's AI-powered routine system.

## What are Workflows?

**Workflows** (also called **routines**) are persistent, AI-executable task definitions that can be run on-demand or on a schedule.

**Key capabilities:**

- **Define once, run many times** - Create reusable task patterns
- **Scheduled or on-demand** - Daily, weekly, monthly, or manual execution
- **AI-executed** - The AI agent can complete workflows autonomously
- **Supplementary materials** - Attach context, code, and note references
- **Completion tracking** - Historical record of each execution

**Use cases:**

- Daily standup note generation
- Weekly review processes
- Monthly report compilation
- Recurring analysis tasks
- Template-based note creation

## Types of Workflows

### Regular Workflows

**Standard task definitions:**

- Created for specific purposes
- Can be one-time or recurring
- Agent executes when triggered
- Completion tracked with metadata

**Example workflows:**

```
"Daily Standup"
- Purpose: Create today's standup note
- Schedule: Every weekday at 9am
- Materials: Standup template, yesterday's tasks

"Weekly Review"
- Purpose: Summarize week's accomplishments
- Schedule: Every Friday at 5pm
- Materials: Project tracking note references

"Research Summary"
- Purpose: Compile research on a topic
- Schedule: On-demand
- Materials: List of source notes, summary template
```

### Backlogs

**Special workflow type for task queues:**

- Type: `backlog`
- Collection of tasks to work through
- No specific schedule
- Work on when convenient

**Example backlogs:**

```
"Reading List"
- Purpose: Books and articles to read
- Materials: Links, PDFs, summaries

"Bug Fixes"
- Purpose: Track bugs to address
- Materials: Bug descriptions, affected code

"Content Ideas"
- Purpose: Blog post and video ideas
- Materials: Outlines, research notes
```

**Difference from regular workflows:**

- Regular workflows: Execute specific procedure
- Backlogs: Accumulation of tasks to process

## Creating Workflows

### Via AI

**Ask the agent to create a workflow:**

```
You: Create a daily standup routine that runs every weekday
     at 9am. It should create a new daily note with sections
     for "Yesterday", "Today", and "Blockers"

AI: I'll create that daily standup routine for you.

    [Creates workflow]

    ✓ Created workflow "Daily Standup"
    - Purpose: Create daily standup note with structured sections
    - Schedule: Every weekday (Mon-Fri) at 9:00 AM
    - Status: Active

    The workflow will automatically run on weekdays. Would you
    like to add a standup template as supplementary material?
```

### Workflow Properties

**Required:**

- **Name** - Max 20 characters, unique within vault
- **Purpose** - Max 100 characters, concise description
- **Description** - Detailed markdown instructions for AI

**Optional:**

- **Status** - `active`, `paused`, `completed`, `archived`
- **Type** - `workflow` (default) or `backlog`
- **Schedule** - Recurring specification
- **Due date** - For one-time workflows
- **Supplementary materials** - Attached context

### Scheduling

**Recurring workflows support:**

**Daily:**

```
Frequency: daily
Optional time: "09:00"
```

**Weekly:**

```
Frequency: weekly
Day of week: Monday (0=Sunday, 1=Monday, ..., 6=Saturday)
Optional time: "14:00"
```

**Monthly:**

```
Frequency: monthly
Day of month: 15 (1-31)
Optional time: "17:00"
```

**Examples:**

```
Every day at 9am:
  { frequency: 'daily', time: '09:00' }

Every Monday at 2pm:
  { frequency: 'weekly', dayOfWeek: 1, time: '14:00' }

15th of each month at 5pm:
  { frequency: 'monthly', dayOfMonth: 15, time: '17:00' }

Every Friday (no specific time):
  { frequency: 'weekly', dayOfWeek: 5 }
```

## Supplementary Materials

**Attach context to workflows** to give the AI necessary information.

### Material Types

**Text:**

- Instructions or guidelines
- Templates
- Reference information

```
You: Add context to the "Weekly Review" workflow explaining
     the review format I prefer

AI: [Adds text material to workflow]

    ✓ Added supplementary material
    - Type: Text
    - Content: "Weekly review should include: accomplishments,
      challenges, lessons learned, next week's priorities"
```

**Code:**

- Code snippets
- Scripts to reference
- Examples

```
You: Add a markdown template to the standup workflow

AI: [Adds code material]

    ✓ Added supplementary material
    - Type: Code
    - Language: Markdown
    - Content: Template with sections for Yesterday, Today, Blockers
```

**Note References:**

- Links to existing notes
- Pull information from notes during execution

```
You: Reference my "Project Tracking" note in the weekly review workflow

AI: [Adds note reference]

    ✓ Added supplementary material
    - Type: Note Reference
    - Note: [[Project Tracking]]
    - The workflow will read this note during execution
```

### Size Limits

**Materials have size constraints:**

- Individual material: 50 KB max
- Total materials per workflow: 500 KB max

**Best practices:**

- Use note references for large content
- Keep templates concise
- Reference external notes rather than copying content

## Running Workflows

### Due Now

**Workflows show up when due:**

```
You: What routines are due today?

AI: You have 2 routines due now:

    1. Daily Standup (recurring - every weekday at 9am)
       Purpose: Create daily standup note

    2. Weekly Review (recurring - every Friday at 5pm)
       Purpose: Summarize week's accomplishments

    Would you like me to complete these routines?
```

### Manual Execution

**Run any workflow on-demand:**

```
You: Run the research summary workflow

AI: I'll execute the "Research Summary" routine.

    [Loads workflow with materials]
    [Executes workflow steps]
    [Creates summary note]

    ✓ Completed routine "Research Summary"
    - Output: [[Research Summary - 2024-01-15]]
    - Duration: 45 seconds
    - Tool calls: 8
```

### AI-Initiated

**The AI can proactively suggest due workflows:**

```
You: Good morning

AI: Good morning! I notice you have 2 routines due today:

    1. Daily Standup (due at 9am)
    2. Morning Planning (due now)

    Would you like me to complete these for you?
```

## Workflow Execution

### How Execution Works

**When a workflow runs:**

1. **Load workflow** - Read name, purpose, description
2. **Load materials** - Fetch all supplementary materials
3. **Load note references** - Read referenced notes
4. **Execute** - AI follows description with context
5. **Record completion** - Track execution metadata

**The AI has access to:**

- Workflow description (instructions)
- All supplementary materials
- Content of referenced notes
- All normal tools (create notes, search, etc.)

### Completion Tracking

**Each execution is recorded:**

```
You: Show me the history for "Daily Standup"

AI: Completion history for "Daily Standup":

    Last 10 completions:

    1. Jan 22, 2024 - 9:05 AM
       - Output: [[Daily Standup - 2024-01-22]]
       - Duration: 12 seconds

    2. Jan 21, 2024 - 9:03 AM
       - Output: [[Daily Standup - 2024-01-21]]
       - Duration: 15 seconds

    3. Jan 20, 2024 - 9:07 AM
       - Output: [[Daily Standup - 2024-01-20]]
       - Duration: 11 seconds

    ...

    Total completions: 47
    Average duration: 13 seconds
```

**Completion metadata:**

- Completion timestamp
- Output note (if created)
- Execution notes
- Duration in milliseconds
- Number of tool calls made

## Managing Workflows

### Listing Workflows

**View all workflows:**

```
You: List my workflows

AI: Your workflows (8 total):

    Due Now (2):
    - Daily Standup: Create daily standup note (Every weekday at 9am)
    - Morning Planning: Plan today's priorities (Every day)

    Upcoming (3):
    - Weekly Review: Summarize week (Every Friday at 5pm)
    - Team Sync Prep: Prepare for team meeting (Every Monday)
    - Monthly Report: Compile monthly metrics (Every 1st at 9am)

    On-Demand (3):
    - Research Summary: Compile research on topic
    - Meeting Notes Template: Create meeting note from template
    - Project Kickoff: Initialize new project structure
```

### Updating Workflows

**Modify workflow properties:**

```
You: Change the weekly review to run on Saturdays instead

AI: [Updates workflow schedule]

    ✓ Updated "Weekly Review"
    - Schedule changed: Friday → Saturday
    - Time: 5pm (unchanged)
    - Next occurrence: Saturday, Jan 27 at 5pm
```

**Update description:**

```
You: Update the daily standup description to include
     a "Wins" section

AI: [Updates workflow description]

    ✓ Updated "Daily Standup" description
    - Added "Wins" section to template
    - Updated supplementary material with new format
```

### Pausing and Archiving

**Pause workflows:**

```
You: Pause the daily standup for this week

AI: [Sets status to 'paused']

    ✓ Paused "Daily Standup"
    - Will not run until reactivated
    - To resume: "Activate the daily standup"
```

**Archive completed workflows:**

```
You: Archive the "Q1 Planning" workflow

AI: [Sets status to 'archived']

    ✓ Archived "Q1 Planning"
    - No longer appears in active routines
    - Completion history preserved
```

### Deleting Workflows

**Deletion is actually archiving:**

```
You: Delete the old research workflow

AI: [Archives workflow]

    ✓ Archived "Old Research Workflow"
    - Marked as archived (soft delete)
    - History preserved
    - Can be restored if needed
```

**Why soft delete:**

- Preserves completion history
- Can reference past executions
- Reversible if needed

## Workflow Templates

### Common Workflow Patterns

**Daily Review:**

```yaml
Name: Daily Review
Purpose: Review today's notes and plan tomorrow
Schedule: Every day at 6pm
Description: |
  1. Open today's daily note
  2. Review what was accomplished
  3. Identify incomplete tasks
  4. Create tomorrow's daily note with priorities
Materials:
  - Daily note template
  - Project tracking note reference
```

**Weekly Cleanup:**

```yaml
Name: Weekly Cleanup
Purpose: Archive completed tasks and organize notes
Schedule: Every Sunday at 8pm
Description: |
  1. Find all completed tasks from this week
  2. Archive them to weekly archive note
  3. Identify orphaned notes (no links)
  4. Suggest organization improvements
Materials:
  - Archive note template
```

**Meeting Prep:**

```yaml
Name: 1-on-1 Prep
Purpose: Prepare for weekly 1-on-1 meeting
Schedule: Every Monday at 8am
Description: |
  1. Review last week's 1-on-1 notes
  2. List accomplishments since last meeting
  3. Identify topics to discuss
  4. Create today's 1-on-1 note with agenda
Materials:
  - Meeting template
  - Reference to previous 1-on-1 notes
  - Current projects note
```

**Content Creation:**

```yaml
Name: Blog Post Draft
Purpose: Create weekly blog post from ideas
Schedule: On-demand
Description: |
  1. Review "Content Ideas" backlog
  2. Select highest priority idea
  3. Research related notes
  4. Create draft outline
  5. Write introduction paragraph
Materials:
  - Blog post template
  - Content ideas backlog reference
  - Writing guidelines
```

## Best Practices

### Workflow Design

**Write clear descriptions:**

**Good:**

```
1. Open today's daily note
2. List all completed tasks (marked with [x])
3. Create a summary section at the top
4. List any blockers or issues
5. Preview tomorrow's priorities
```

**Bad:**

```
Review the day and make a summary
```

**Be specific:**

- Step-by-step instructions
- Explicit inputs and outputs
- Clear success criteria

### Material Organization

**Use materials effectively:**

**Templates as code materials:**

```
Type: Code (Markdown)
Content: Full note template
Language: markdown
```

**Guidelines as text materials:**

```
Type: Text
Content: "When creating summaries, focus on impact
         rather than activities. Highlight outcomes."
```

**Dynamic data as note references:**

```
Type: Note Reference
Note: [[Project Tracking]]
Reason: Content changes frequently, reference is better
       than copying
```

### Scheduling Strategy

**Don't over-schedule:**

- Too many daily routines = overwhelm
- Use on-demand for occasional tasks
- Pause routines during vacation

**Timing considerations:**

```
Good: Daily standup at 9am (start of work)
Good: Weekly review at 5pm Friday (end of week)
Bad: Daily review at midnight (might miss it)
Bad: Weekly planning at 2am Sunday (asleep)
```

### Workflow Lifecycle

**Start → Monitor → Adjust:**

1. **Create workflow** with initial best guess
2. **Let it run** for a week or two
3. **Review completions** - are they useful?
4. **Adjust description** based on results
5. **Refine materials** as needed
6. **Optimize schedule** if timing is off

**Iterate:**

- Workflows improve over time
- Don't expect perfection initially
- Adjust based on actual usage

## Advanced Techniques

### Workflow Chaining

**One workflow can reference another's output:**

```yaml
Workflow 1: Daily Data Collection
Purpose: Gather today's metrics
Output: [[Daily Metrics - DATE]]

Workflow 2: Weekly Analysis
Purpose: Analyze week's daily metrics
Materials:
  - Note references to past 7 daily metric notes
  - Analysis template
```

**The second workflow automatically reads first's outputs.**

### Conditional Workflows

**Use description to handle different scenarios:**

```yaml
Name: Standup (Context-Aware)
Description: |
  1. Check if today is Monday
     - If Monday: Include "Weekend Summary" section
     - If other day: Use standard template
  2. Check for any overdue tasks
     - If found: Highlight in "Blockers" section
  3. Create standup note with appropriate format
```

**AI interprets conditions and executes accordingly.**

### Workflow with Dynamic Materials

**Materials can reference latest notes:**

```yaml
Name: Progress Report
Materials:
  - Note reference: [[Project Alpha]] (always current version)
  - Text: "Focus on changes since last report"
Description: |
  1. Read [[Project Alpha]] for current status
  2. Read last progress report to find what changed
  3. Create new progress report highlighting deltas
```

**No need to update materials - note references stay current.**

## Integration with Other Features

### Workflows + Daily Notes

**Workflows can manage daily notes:**

```
Daily Note Workflow:
1. Create today's daily note from template
2. Copy forward incomplete tasks from yesterday
3. Add scheduled meetings from calendar note
4. Generate morning priorities
```

**Result:** Automated daily note preparation

### Workflows + Review System

**Combine with spaced repetition:**

```
Review Workflow:
1. Check which notes are due for review today
2. Create a "Review Session" note
3. List all notes to review
4. Provide review reminders
```

### Workflows + Search

**Workflows can search and organize:**

```
Cleanup Workflow:
1. Search for notes tagged "inbox"
2. For each note, determine proper type
3. Suggest organization
4. Create summary of inbox status
```

### Workflows + AI Conversations

**Workflows are AI-executed:**

- Run workflows in conversation
- Workflows have full access to tools
- Can ask clarifying questions during execution

## Troubleshooting

### Workflow Not Running

**Problem:** Scheduled workflow didn't execute.

**Solutions:**

1. **Check status:** Might be paused

   ```
   You: Why didn't my daily standup run?
   AI: The "Daily Standup" workflow is paused.
   ```

2. **Check schedule:** Might be misconfigured

   ```
   You: Show schedule for daily standup
   AI: Schedule: Every weekday at 9am
       Last ran: Yesterday at 9:05am
       Next run: Tomorrow at 9am (today is Saturday)
   ```

3. **Activate if needed:**
   ```
   You: Activate the daily standup
   AI: ✓ Activated "Daily Standup"
   ```

### Workflow Execution Failed

**Problem:** Workflow ran but didn't complete successfully.

**Check completion notes:**

```
You: What happened with the last weekly review?

AI: Last execution of "Weekly Review" (Jan 22):
    - Status: Partial completion
    - Notes: "Could not find [[Project Tracking]] note"
    - Error: Referenced note was deleted

    Fix: Update workflow to remove deleted note reference
```

### Too Many Workflows

**Problem:** Overwhelmed by workflow notifications.

**Solutions:**

1. **Pause occasional workflows:**

   ```
   You: Pause all monthly workflows until Q2
   AI: [Pauses workflows]
   ```

2. **Archive old workflows:**

   ```
   You: Archive completed Q1 workflows
   AI: [Archives completed workflows from Q1]
   ```

3. **Adjust schedules:**
   ```
   You: Change daily cleanup to weekly
   AI: [Updates schedule]
   ```

## Next Steps

- **[AI Agent](/features/agent)** - AI executes workflows
- **[Daily Notes](/features/daily-notes)** - Common workflow output
- **[Custom Functions](/features/custom-functions)** - Advanced automation
- **[Templates](/features/templates)** - Create workflow materials

---

**Remember:** Workflows are powerful when kept simple. Start with one or two essential routines, perfect them, then add more. The goal is to automate repetitive thinking, not to add complexity.
