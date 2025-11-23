# Best Practices

Proven strategies for getting the most out of Flint's note-taking and AI capabilities.

## Philosophy

### Start Simple, Evolve Gradually

**Don't over-organize upfront:**

- Begin with basic notes
- Let structure emerge naturally
- Add complexity only when needed
- Trust the process

**Example progression:**

```
Week 1:  Just write notes, use general type
Week 2:  Start linking with [[wikilinks]]
Month 1: Create custom note types
Month 2: Add workflows and automation
Month 3: Develop personal system
```

### Notes Are for Thinking, Not Storage

**Active vs passive:**

- **Good:** Notes that help you think
- **Good:** Notes that connect ideas
- **Bad:** Copy-paste dumps
- **Bad:** Information you'll never revisit

**Questions to ask:**

- "Will I actually use this?"
- "Does this help me think?"
- "Am I adding value or just copying?"

### Let the AI Assist, Not Replace

**AI is a tool, not a replacement:**

- Use AI to help organize, not dictate structure
- Have AI suggest, you decide
- Maintain your voice and thinking
- Don't outsource judgment

**Good AI usage:**

```
You: Help me organize these meeting notes

AI: I notice three main themes:
    1. Product decisions
    2. Team updates
    3. Action items

    Should I create sections for these?

You: Yes, but add "Blockers" as well

AI: [Organizes with your structure]
```

## Note Organization

### The Three-Layer System

**Layer 1: Capture**

- Daily notes for immediate capture
- Inbox for quick thoughts
- No organization needed
- Focus on getting ideas down

**Layer 2: Process**

- Review daily notes weekly
- Extract important ideas
- Create permanent notes
- Link related concepts

**Layer 3: Structure**

- Hub notes for major topics
- Index notes for projects
- MOCs (Maps of Content)
- Curated collections

**Don't skip layers:**

- Capture first, organize later
- Process regularly (weekly)
- Structure emerges from processing

### Note Types Strategy

**Use types to indicate intent:**

**General** - Default for most notes

```
Use when: Not sure what type yet
Examples: Quick thoughts, meeting notes, ideas
```

**Permanent** - Refined knowledge

```
Use when: Extracted from daily notes, polished
Examples: Concepts, principles, insights
```

**Literature** - From external sources

```
Use when: Reading books, articles, papers
Examples: Book notes, article summaries
```

**Project** - Active work

```
Use when: Coordinating a project
Examples: Project plans, status, resources
```

**Custom** - Domain-specific

```
Create when: Repeated pattern emerges
Examples: Bug reports, client notes, recipes
```

### Wikilink Guidelines

**Link liberally:**

- Don't overthink linking
- Link when you mention a concept
- Create notes for future ideas
- Trust that connections will be useful

**Good linking:**

```markdown
Discussed [[API Design Principles]] with the team.
Need to update [[System Architecture]] based on
the new [[Authentication Flow]].
```

**Create hub notes:**

```markdown
# Project Alpha

## Overview

[[Project Alpha Overview]]

## Technical

- [[Architecture Decisions]]
- [[Database Schema]]
- [[API Endpoints]]

## Management

- [[Timeline]]
- [[Team Assignments]]
- [[Risk Register]]
```

**Bi-directional thinking:**

- Every link creates a backlink
- Backlinks show unexpected connections
- Review backlinks regularly
- Discover emergent patterns

### Avoid Over-Organization

**Don't create folders/hierarchies:**

- Flint uses types, not folders
- Links are better than hierarchies
- Search is powerful
- Trust flat structure + wikilinks

**Don't pre-create structure:**

```
❌ Bad:
Create 20 empty notes for a system you haven't built
Create elaborate templates before understanding needs

✓ Good:
Create notes as you need them
Develop templates after repetition
Let structure emerge
```

**Don't tag everything:**

```
❌ Bad: [[Tag: todo]] [[Tag: important]] [[Tag: review]] [[Tag: project]]

✓ Good: #important (for filtering)
        [[Project Alpha]] (for grouping)
```

## Daily Note Practices

### Morning Routine

**Start your day with intention:**

```markdown
## Morning

### Today's Focus

- Main priority: [[Feature X]] implementation
- Secondary: Review [[Pull Requests]]

### Schedule

- 9am: [[Team Standup]]
- 2pm: [[Client Meeting]]

### Energy Check

Feeling: Focused
Energy: High
```

**5 minutes of planning saves hours of confusion.**

### Throughout the Day

**Capture continuously:**

```markdown
## Afternoon

14:30 - Interesting idea from [[Sarah]]: What if we
approached [[Problem X]] using [[Pattern Y]]?
Need to explore this.

15:00 - [[Client Meeting]] notes: - Happy with progress - Wants [[Feature Z]] prioritized - Deadline: [[2024-02-15]]
```

**Don't wait until evening - you'll forget details.**

### Evening Review

**Close the day intentionally:**

```markdown
## Evening

### Accomplished

- ✅ Completed [[Feature X]] implementation
- ✅ Reviewed 3 PRs
- ✅ Client meeting went well

### Tomorrow

- Start [[Feature Z]] (client priority)
- Follow up on [[Sarah]]'s idea about [[Problem X]]

### Notes

- Realized [[Architecture Decision]] needs revisiting
- Created [[Feature Z Spec]] based on client feedback
```

**10 minutes of review sets up tomorrow's success.**

## AI Collaboration

### Effective Prompting

**Be specific about context:**

```
❌ Bad: "Summarize this"

✓ Good: "Summarize this meeting note focusing on
        decisions made and action items"
```

**Specify format:**

```
❌ Bad: "Create a project note"

✓ Good: "Create a project note with sections for:
        - Overview
        - Goals
        - Timeline
        - Resources
        - Risks"
```

**Iterate, don't expect perfection:**

```
You: Create a weekly review template

AI: [Creates template]

You: Good, but add a "Lessons Learned" section

AI: [Updates template]

You: Perfect, now use this for this week's review
```

### AI as Research Assistant

**Let AI gather information:**

```
You: Find all notes where I discussed [[API Design]]

AI: Found 12 notes mentioning API Design:
    - [[Architecture Decisions]] (3 mentions)
    - [[Meeting Notes - Jan 15]] (2 mentions)
    ...

You: Summarize the common themes

AI: Common themes across your API design discussions:
    1. RESTful principles (8 notes)
    2. Versioning strategy (5 notes)
    3. Authentication (4 notes)
```

**AI excels at synthesis.**

### AI as Writing Partner

**Draft, then refine:**

```
You: Help me write an email to the client about
     the timeline change

AI: [Drafts email]

You: Too formal, make it more conversational

AI: [Revises]

You: Better. Add a specific example of why we
     need more time

AI: [Adds example]
```

**You drive, AI assists.**

### What NOT to Ask AI

**Don't outsource thinking:**

```
❌ "Decide which approach I should take"
✓ "Here are three approaches I'm considering,
   help me understand the tradeoffs"
```

**Don't delegate judgment:**

```
❌ "Is this a good idea?"
✓ "What are the potential issues with this approach?"
```

**Don't replace expertise:**

```
❌ "Write production code for me"
✓ "Help me sketch out the structure for this feature"
```

## Search Strategies

### Use Search Operators

**Filter by type:**

```
type:daily
type:project
type:permanent
```

**Filter by tag:**

```
tag:important
tag:review
```

**Filter by date:**

```
created:today
created:this-week
modified:this-month
```

**Combine operators:**

```
type:daily created:this-week
tag:important modified:today
```

### Full-Text Search

**Search for phrases:**

```
"exact phrase"
```

**Search for concepts:**

```
authentication security
```

**Search in specific notes:**

- Open note
- Use Cmd/Ctrl+F for in-note search

### Search Workflow

**Weekly review search:**

```
1. created:this-week → See what you created
2. modified:this-week → See what you updated
3. type:daily created:this-week → Review your week
```

**Project search:**

```
[[Project Name]] → All notes mentioning project
type:project → All project notes
tag:project-name → Tagged project notes
```

## Vault Management

### Single Vault vs Multiple

**Most users: One vault**

```
Advantages:
- Everything searchable
- All connections visible
- Simpler mental model
- Unified knowledge base
```

**Use multiple vaults when:**

```
- Work vs Personal (privacy/separation)
- Different domains (writing vs coding vs research)
- Client work (one vault per client)
- Collaboration (shared vs private)
```

**Don't over-split:**

```
❌ Bad: 10+ vaults for minor separations
✓ Good: 2-3 vaults for major contexts
```

### Vault Hygiene

**Regular maintenance:**

```
Weekly:
- Review inbox notes
- Process daily notes
- Archive completed projects

Monthly:
- Check for orphaned notes
- Review pinned notes (still relevant?)
- Clean up temporary tabs
- Update hub notes

Quarterly:
- Review note types (still useful?)
- Archive old project notes
- Evaluate vault structure
- Adjust workflows
```

## Workflows and Automation

### When to Create Workflows

**Create workflow when:**

- You do something more than 3 times
- Process is clearly defined
- AI can execute it
- Saves significant time

**Don't create workflow when:**

- Process is still evolving
- Requires human judgment
- One-off or rare task
- Simpler to do manually

### Workflow Design Principles

**Start simple:**

```
v1: "Create daily note with sections"
v2: "Create daily note, copy incomplete tasks"
v3: "Create daily note, copy tasks, add calendar"
```

**Iterate based on results.**

**Clear instructions:**

```
❌ Bad: "Process the weekly stuff"

✓ Good:
1. Read this week's daily notes
2. Extract all completed tasks
3. Group by project
4. Create weekly summary note
5. List accomplishments by project
```

**Include examples:**

```
Example output:

# Weekly Summary - 2024-W04

## Accomplishments

### Project Alpha
- Completed API integration
- Fixed 3 critical bugs
...
```

### Workflow Scheduling

**Don't over-schedule:**

```
✓ Good:
- 1-2 daily workflows
- 1-2 weekly workflows
- 1 monthly workflow

❌ Too much:
- 5 daily workflows
- 10 weekly workflows
- Constant interruptions
```

**Timing matters:**

```
Good: Daily standup at 9am (start of day)
Bad: Daily standup at 11pm (might miss it)

Good: Weekly review Friday 5pm (end of week)
Bad: Weekly review Tuesday 2am (asleep)
```

## Review System Best Practices

### What to Review

**Review concepts, not facts:**

```
✓ Good: Core principles, frameworks, processes
❌ Bad: Specific data points, lookupable facts
```

**Review what you use:**

```
✓ Good: Skills you're actively developing
❌ Bad: Information you never apply
```

### Review Rhythm

**Consistency over marathon sessions:**

```
✓ Good: 10 minutes daily
❌ Bad: 2 hours once a month
```

**Time of day:**

```
Morning: Review before meetings
Afternoon: Review during low-energy periods
Evening: Review to consolidate day's learning
```

**Pick one, stick to it.**

### Review Responses

**Explain, don't memorize:**

```
❌ Bad: "REST has 6 principles: client-server,
        stateless, cacheable, layered, code-on-demand,
        uniform interface"

✓ Good: "REST principles focus on scalability and
        simplicity. The key ones I use are stateless
        (each request is independent) and uniform interface
        (consistent API design). This makes systems more
        reliable because..."
```

**Understanding > Recall.**

## Data Management

### Backup Strategy

**3-2-1 rule:**

- 3 copies of data
- 2 different media types
- 1 off-site

**For Flint:**

```
Copy 1: Vault folder (working copy)
Copy 2: Cloud backup (Dropbox/iCloud/Google Drive)
Copy 3: External drive backup (weekly)
```

**Automate backups:**

- Cloud sync: Automatic
- Time Machine (macOS): Automatic
- Manual backup: Weekly reminder

### Version Control

**Use Git for important vaults:**

```bash
cd ~/Documents/MyVault
git init
git add .
git commit -m "Initial commit"

# Daily or weekly
git add .
git commit -m "Notes from this week"
```

**Benefits:**

- Full history of changes
- Can revert mistakes
- See how thinking evolved
- Branch for experiments

**For casual users:** Cloud backup is enough.

### Data Portability

**Flint data is portable:**

- Notes are markdown files
- Readable in any text editor
- Not locked to Flint
- Future-proof format

**To export:**

- Copy vault folder
- All notes included
- Use anywhere

## Privacy and Security

### API Key Security

**Never share API keys:**

- Treat like passwords
- Don't commit to Git
- Don't share screenshots containing keys
- Rotate periodically

**Flint stores securely:**

- OS keychain (macOS)
- Credential Manager (Windows)
- Secret Service (Linux)
- Never in plain text

### Sensitive Information

**Be cautious in notes:**

- Don't store passwords in notes
- Be careful with personal information
- Consider vault encryption for sensitive data
- Remember: AI sees note content

**For very sensitive information:**

- Use separate encrypted vault
- Don't enable AI for that vault
- Or use different tool entirely

### AI Privacy

**What AI sees:**

- Current conversation
- Notes you explicitly reference
- Vault context you provide

**What AI doesn't see:**

- Other vaults
- Notes not in conversation
- Your API keys
- System information

**Data transmission:**

- Sent to AI provider (OpenRouter/Claude/etc.)
- Encrypted in transit
- Subject to provider's privacy policy

## Performance Optimization

### Keep Vaults Manageable

**Size guidelines:**

```
Small: < 1,000 notes (excellent performance)
Medium: 1,000 - 5,000 notes (good performance)
Large: 5,000 - 10,000 notes (acceptable performance)
Very Large: > 10,000 notes (consider splitting)
```

**Vault size doesn't usually matter until very large.**

### Note Size

**Optimal note size:**

```
✓ Good: 100-500 lines (easy to work with)
⚠ Okay: 500-1,000 lines (still manageable)
❌ Too large: > 2,000 lines (consider splitting)
```

**Split large notes:**

```
Before:
- "Everything About Project Alpha" (3,000 lines)

After:
- [[Project Alpha Overview]] (hub note, 200 lines)
- [[Project Alpha Architecture]] (500 lines)
- [[Project Alpha API]] (400 lines)
- [[Project Alpha Database]] (300 lines)
```

### Database Maintenance

**Rebuild database if:**

- Search seems slow
- Notes missing from search
- After importing many notes
- Once a month as maintenance

**How:**

```
Settings → Database → Rebuild Database
```

**Safe to do anytime - reconstructs from markdown files.**

## Common Pitfalls

### Over-Organization

**Symptom:**

- Spending more time organizing than writing
- Creating elaborate systems before content
- Analysis paralysis

**Solution:**

- Write first, organize later
- Let structure emerge
- Start simple

### Under-Linking

**Symptom:**

- Notes feel isolated
- No connections emerging
- Not seeing relationships

**Solution:**

- Link when you mention concepts
- Review backlinks regularly
- Create hub notes for topics

### Inconsistent Practice

**Symptom:**

- Using Flint sporadically
- Forgetting to capture
- No rhythm established

**Solution:**

- Set daily reminder
- Start with just daily notes
- Build habit before expanding

### AI Over-Reliance

**Symptom:**

- Asking AI for everything
- Not thinking independently
- AI becomes crutch

**Solution:**

- Write first draft yourself
- Use AI to refine, not create
- Develop your thinking skills

## Progress Over Perfection

**Remember:**

- Notes don't need to be perfect
- Organization evolves over time
- Mistakes are learning opportunities
- Done is better than perfect

**Your note-taking practice will improve through use, not through planning.**

## Next Steps

- **[Core Concepts](/guides/core-concepts)** - Understand Flint's philosophy
- **[Getting Started](/getting-started)** - Begin your practice
- **[Daily Notes](/features/daily-notes)** - Start with daily journaling

---

**Final thought:** The best note-taking system is the one you actually use. Start simple, be consistent, and let your practice evolve naturally. Flint will grow with you.
