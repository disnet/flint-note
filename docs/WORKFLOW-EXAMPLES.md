# Agent Workflow Examples

This document contains a collection of example workflows demonstrating the versatility and power of the Agent Workflows system. These examples are organized by category and show both recurring and on-demand workflows.

---

## Personal Knowledge Management

### 7. Reading Notes Digest (Weekly Recurring)

**Purpose**: Compile weekly reading highlights into organized notes

**Description**:

```
1. Find all notes tagged "reading", "book", or "article" from past week
2. Extract highlights and key quotes
3. Categorize by topic/theme (technical, business, philosophy, etc.)
4. Identify recurring themes across different sources
5. Create connections to existing knowledge base notes
6. Flag items that warrant deeper research or follow-up
7. Generate weekly reading digest note with sections:
   - Key Insights
   - Interesting Quotes
   - Topics to Explore Further
   - Connections to Existing Knowledge
```

**Recurring Schedule**: Weekly, Sunday at 17:00

**Supplementary Materials**:

- Reading digest template
- Example categorization taxonomy

**Use Case**: Someone who reads extensively and wants to retain and connect ideas across sources.

---

### 8. Idea Incubation Review (Bi-weekly Recurring)

**Purpose**: Review and evolve ideas in "seedling" status

**Description**:

```
1. Find all notes tagged "idea", "seedling", or "brainstorm"
2. For each idea note:
   - Check if new related notes have been created
   - Look for connections to recent work/reading
   - Assess if idea has matured enough for action
3. Promote mature ideas to "evergreen" status
4. Archive stale ideas (no development in 3+ months)
5. Create action items for promising ideas
6. Update idea index with current state
```

**Recurring Schedule**: Every other Sunday at 19:00

**Use Case**: Maintaining a personal idea incubator where concepts can develop over time.

---

### 9. Question Backlog Processing (Monthly Recurring)

**Purpose**: Review unanswered questions and research opportunities

**Description**:

```
1. Find all notes with "?" tag or "question" marker
2. Categorize questions by domain (technical, personal, business, etc.)
3. For each question:
   - Check if it's been answered in recent notes
   - Assess current relevance and importance
   - Identify resources needed to answer
4. Create research tasks for high-priority unanswered questions
5. Archive questions that are no longer relevant
6. Create "Curiosity Report" with top 10 active questions
```

**Recurring Schedule**: Monthly on the 15th at 20:00

**Use Case**: Maintaining a personal curiosity backlog and ensuring important questions get answered.

---

## Work & Productivity

### 10. Sprint Planning Prep (Weekly Recurring)

**Purpose**: Prepare materials for weekly sprint planning meeting

**Description**:

```
1. Review last week's sprint notes and outcomes
2. Gather list of completed items with links to work
3. Compile blockers and impediments from daily notes
4. Check status of all active projects
5. Review product roadmap for upcoming priorities
6. Create sprint planning note with pre-populated sections:
   - Last Sprint Summary
   - Completed Work
   - Blockers Resolved/Outstanding
   - Proposed Focus Areas
   - Open Questions for Team
7. Link relevant technical specs and design docs
8. Flag items needing discussion
```

**Recurring Schedule**: Weekly, Monday at 09:00

**Supplementary Materials**:

- Sprint planning template
- Project roadmap reference note
- Team capacity calculator

**Use Case**: Engineering teams doing weekly sprint planning.

---

### 11. Standup Note Generator (Daily Recurring)

**Purpose**: Create daily standup summary from yesterday's work

**Description**:

```
1. Review yesterday's daily note for work items
2. Check git commits/PR activity from yesterday
3. Identify completed tasks and progress made
4. List today's planned work from task list
5. Flag any blockers or help needed
6. Format into standup template:
   - Yesterday: [accomplishments]
   - Today: [plans]
   - Blockers: [issues]
7. Add note to today's daily note
```

**Recurring Schedule**: Daily (weekdays only) at 08:30

**Supplementary Materials**:

- Standup note template

**Use Case**: Remote teams with async standups or preparation for sync standup meetings.

---

### 12. Performance Review Prep (Quarterly Recurring)

**Purpose**: Compile accomplishments for quarterly review

**Description**:

```
1. Find all project notes from current quarter
2. Extract key wins, accomplishments, and delivered features
3. Gather quantitative metrics and outcomes
4. Identify major challenges overcome
5. Note new skills learned or areas of growth
6. Collect feedback received from peers/stakeholders
7. Create structured review document with sections:
   - Major Accomplishments
   - Impact & Metrics
   - Challenges & Learnings
   - Growth Areas
   - Goals for Next Quarter
8. Link supporting evidence (project notes, metrics, feedback)
```

**Recurring Schedule**: Monthly on 1st of quarter-end months (March, June, September, December) at 10:00

**Supplementary Materials**:

- Performance review template
- Company review guidelines

**Use Case**: Professionals with regular performance reviews.

---

### 13. 1-on-1 Meeting Prep (Weekly/Bi-weekly Recurring)

**Purpose**: Prepare talking points for recurring 1-on-1s

**Description**:

```
1. Review notes from previous 1-on-1 with this person
2. Check status of action items from last meeting
3. Review recent project work involving this person
4. Identify new topics to discuss:
   - Feedback to give/receive
   - Projects to align on
   - Career development topics
   - Team/org updates
5. Gather any metrics or data points to share
6. Create agenda note with prioritized topics
7. Add private notes section for personal reminders
```

**Recurring Schedule**: Weekly or bi-weekly (user configurable per manager)

**Supplementary Materials**:

- 1-on-1 agenda template
- Running 1-on-1 log per person

**Use Case**: Managers and individual contributors with regular 1-on-1 meetings.

---

## Content Creation

### 14. Newsletter Compilation (Weekly Recurring)

**Purpose**: Curate week's best insights into newsletter draft

**Description**:

```
1. Find all notes tagged "share" or "newsletter" from past week
2. Review reading notes and interesting discoveries
3. Select top 3-5 items that would interest audience
4. For each selected item:
   - Write brief introduction/context
   - Add personal commentary or takeaway
   - Include relevant links
5. Add personal reflection on week's themes
6. Format in newsletter template
7. Create draft newsletter note for editing
8. Flag any items needing fact-checking
```

**Recurring Schedule**: Weekly, Thursday at 15:00

**Supplementary Materials**:

- Newsletter template with intro/sections/outro
- Previous newsletter examples
- Audience persona guide

**Use Case**: Knowledge workers who publish regular newsletters (Substack, etc.).

---

### 15. Blog Post Ideas Generator (Monthly Recurring)

**Purpose**: Transform interesting notes into blog post outlines

**Description**:

```
1. Find notes with high link density (>5 backlinks)
2. Find notes tagged "interesting" or "deep-dive"
3. Review notes marked for expansion
4. For each potential topic:
   - Assess uniqueness of perspective
   - Check if there's enough material for full post
   - Identify gaps that need research
5. Create outline structure for top 3 ideas:
   - Hook/Opening
   - Main Points (3-5)
   - Examples/Stories
   - Conclusion/Call-to-action
6. Flag research needed for each outline
7. Add to content calendar
```

**Recurring Schedule**: Monthly on last Sunday at 14:00

**Supplementary Materials**:

- Blog post outline template
- Content calendar

**Use Case**: Bloggers and content creators looking for topic ideas.

---

### 16. Social Media Content Pipeline (Weekly Recurring)

**Purpose**: Create week's worth of social content from notes

**Description**:

```
1. Extract quotable insights from week's notes
2. Identify 2-3 topics that could become threads
3. Create thread outlines with:
   - Hook tweet
   - 3-5 supporting points
   - Conclusion with call-to-action
4. Draft standalone posts from interesting tidbits
5. Schedule posting order (best times)
6. Link each post back to source note
7. Create weekly content calendar note
```

**Recurring Schedule**: Weekly, Sunday at 16:00

**Supplementary Materials**:

- Thread template
- Posting schedule guide
- Analytics from past posts

**Use Case**: Building in public / thought leadership on social media.

---

## Personal Development

### 17. Habit Tracker Review (Weekly Recurring)

**Purpose**: Analyze habit patterns and adjust strategies

**Description**:

```
1. Review daily notes for habit checkmarks/tracking
2. Calculate completion rate for each tracked habit
3. Identify current streaks and longest streaks
4. Look for patterns:
   - Days with high success vs low success
   - Correlation with sleep, stress, schedule
   - Environmental factors affecting compliance
5. Celebrate wins and progress
6. Identify struggling habits needing strategy adjustment
7. Create weekly habit summary with:
   - Completion rates
   - Insights from patterns
   - Adjustments to try next week
```

**Recurring Schedule**: Weekly, Sunday at 20:00

**Supplementary Materials**:

- Habit tracking template
- Behavior design resources

**Use Case**: Anyone working on building sustainable habits.

---

### 18. Goal Progress Check-in (Monthly Recurring)

**Purpose**: Review progress toward quarterly/yearly goals

**Description**:

```
1. Review goal notes for all active goals
2. For each goal:
   - Update progress percentage
   - List concrete actions taken this month
   - Identify blockers or challenges
   - Assess if timeline is realistic
3. Celebrate completed milestones
4. Adjust strategies for goals behind schedule
5. Check alignment with values/priorities
6. Create monthly goal report with:
   - Progress Summary
   - Wins
   - Challenges
   - Next Month's Focus
7. Update goal dashboard/index
```

**Recurring Schedule**: Monthly on 1st at 09:00

**Supplementary Materials**:

- Goal tracking template
- Quarterly goals overview

**Use Case**: Goal-oriented individuals tracking personal/professional development.

---

### 19. Gratitude Journal Themes (Monthly Recurring)

**Purpose**: Identify patterns in what brings joy/gratitude

**Description**:

```
1. Review all gratitude entries from past month
2. Categorize themes:
   - People (family, friends, colleagues)
   - Experiences (moments, activities)
   - Achievements (personal, professional)
   - Simple pleasures (nature, food, art)
3. Count frequency of each theme
4. Identify patterns:
   - What consistently brings joy?
   - Any new sources of gratitude?
   - Are priorities reflected in gratitudes?
5. Create monthly gratitude summary
6. Set intentions for next month based on insights
```

**Recurring Schedule**: Monthly on last day at 21:00

**Use Case**: Reflective practice and well-being.

---

## Research & Learning

### 20. Literature Review Update (Monthly Recurring)

**Purpose**: Organize and synthesize research paper notes

**Description**:

```
1. Find all notes tagged with research topic
2. Create or update citation graph showing:
   - Which papers cite each other
   - Key authors and their connections
   - Chronological development of ideas
3. Identify:
   - Gaps in current understanding
   - Contradictory findings needing resolution
   - Seminal papers to revisit
4. Update literature review note with:
   - Current state of knowledge
   - Open questions
   - Research roadmap
5. Flag papers needing closer reading
```

**Recurring Schedule**: Monthly on 1st at 14:00

**Supplementary Materials**:

- Literature review template
- Citation format guide

**Use Case**: Academic research or deep topic study.

---

### 21. Course Notes Consolidation (On-demand)

**Purpose**: Transform lecture notes into study guides

**Description**:

```
1. Gather all notes from current course module
2. Extract key concepts and definitions
3. Create flashcard entries for important terms
4. Link to practice problems and exercises
5. Identify topics that are still unclear
6. Create study guide with:
   - Concept Overview
   - Key Formulas/Rules
   - Common Pitfalls
   - Practice Questions
   - Resources for Review
7. Flag topics needing professor clarification
```

**Trigger**: When course module completes

**Supplementary Materials**:

- Study guide template
- Flashcard format

**Use Case**: Students taking structured courses.

---

### 22. Reading List Pruning (Quarterly Recurring)

**Purpose**: Review and curate reading backlog

**Description**:

```
1. Review all notes in "to-read" category
2. For each item:
   - Check if still relevant to current goals
   - Verify if topic already covered elsewhere
   - Assess priority (high/medium/low)
3. Remove items that are:
   - No longer relevant
   - Superseded by newer resources
   - Outside current focus areas
4. Prioritize remaining items by:
   - Alignment with goals
   - Time sensitivity
   - Dependencies (foundational vs advanced)
5. Create curated reading list for next quarter
6. Archive removed items for potential future reference
```

**Recurring Schedule**: Quarterly on 1st at 15:00

**Supplementary Materials**:

- Reading list template
- Current learning goals

**Use Case**: Managing information overload and focused learning.

---

## Health & Wellness

### 23. Sleep Pattern Analysis (Weekly Recurring)

**Purpose**: Review sleep data and identify improvement opportunities

**Description**:

```
1. Compile sleep notes/data from past week
2. Calculate:
   - Average sleep duration
   - Sleep consistency (bedtime variance)
   - Wake time patterns
3. Look for correlations with:
   - Productivity levels
   - Mood/energy ratings
   - Exercise days
   - Caffeine/alcohol consumption
4. Identify concerning patterns:
   - Consecutive nights of poor sleep
   - Unusual wake times
   - Declining averages
5. Create weekly sleep summary
6. Set sleep goals for next week
```

**Recurring Schedule**: Weekly, Monday at 08:00

**Supplementary Materials**:

- Sleep tracking template
- Sleep hygiene checklist

**Use Case**: Improving sleep quality and understanding sleep patterns.

---

### 24. Meal Planning & Nutrition Review (Weekly Recurring)

**Purpose**: Plan week's meals based on past preferences

**Description**:

```
1. Review recipes tried in past month
2. Note which meals were:
   - Quick and easy
   - Nutritious and satisfying
   - Family favorites
3. Check pantry/fridge inventory notes
4. Plan 5-7 dinners for next week considering:
   - Nutritional balance
   - Prep time available
   - Ingredient overlap (efficiency)
   - Dietary goals
5. Generate shopping list organized by store section
6. Note prep that can be done ahead
7. Add meal plan to weekly note
```

**Recurring Schedule**: Weekly, Saturday at 10:00

**Supplementary Materials**:

- Recipe collection
- Meal planning template
- Shopping list template

**Use Case**: Healthy eating and reducing meal decision fatigue.

---

## Financial & Planning

### 25. Expense Categorization (Monthly Recurring)

**Purpose**: Review and categorize month's expenses

**Description**:

```
1. Find all expense notes from past month
2. Categorize each expense:
   - Housing (rent, utilities, maintenance)
   - Food (groceries, dining out)
   - Transportation
   - Entertainment
   - Health
   - Other
3. Calculate totals per category
4. Identify unusual or one-time expenses
5. Compare to budget allocations
6. Flag categories over budget
7. Create monthly spending summary with:
   - Category breakdown
   - Budget comparison
   - Unusual items
   - Trends vs previous months
```

**Recurring Schedule**: Monthly on 1st at 11:00

**Supplementary Materials**:

- Expense categories
- Monthly budget template

**Use Case**: Personal finance tracking and budgeting.

---

### 26. Investment Review & Rebalance Check (Quarterly Recurring)

**Purpose**: Review portfolio and note rebalancing needs

**Description**:

```
1. Gather investment notes and current holdings
2. Calculate current allocation percentages:
   - Stocks vs bonds
   - Domestic vs international
   - Sector exposure
3. Compare to target allocation
4. Identify deviations >5% from targets
5. Review performance vs benchmarks
6. Note any needed rebalancing trades
7. Check for:
   - Tax loss harvesting opportunities
   - Dividend reinvestment status
8. Create quarterly investment review note
```

**Recurring Schedule**: Quarterly on 1st at 16:00

**Supplementary Materials**:

- Target allocation reference
- Rebalancing guidelines

**Use Case**: Personal investment management.

---

## Home & Life Admin

### 27. Home Maintenance Schedule (Seasonal Recurring)

**Purpose**: Create checklist for seasonal home maintenance

**Description**:

```
1. Review last season's maintenance notes
2. Create checklist for current season:

   Spring:
   - HVAC filter replacement
   - Gutter cleaning
   - Exterior inspection
   - Garden prep

   Summer:
   - AC servicing
   - Deck/patio maintenance
   - Irrigation check

   Fall:
   - Heating system check
   - Weatherproofing
   - Gutter cleaning
   - Chimney inspection

   Winter:
   - Pipe insulation check
   - Snow equipment prep
   - Indoor air quality

3. Schedule contractor appointments
4. Create shopping list for supplies
5. Set reminders for time-sensitive items
```

**Recurring Schedule**: Seasonal (March 1, June 1, September 1, December 1) at 10:00

**Supplementary Materials**:

- Seasonal checklists
- Contractor contact list
- Maintenance history

**Use Case**: Homeowners maintaining their property.

---

### 28. Travel Planning Compilation (On-demand)

**Purpose**: Gather all research for upcoming trip into itinerary

**Description**:

```
1. Find all notes tagged with destination name
2. Compile recommendations:
   - Restaurants (by meal type and area)
   - Activities and attractions
   - Day trip options
   - Local tips and customs
3. Create day-by-day itinerary considering:
   - Geographic proximity
   - Operating hours/days
   - Energy level needed
   - Weather considerations
4. Generate packing list based on:
   - Climate
   - Planned activities
   - Trip duration
5. Create budget estimate
6. List reservations needed
7. Compile into comprehensive travel guide note
```

**Trigger**: When planning a trip

**Supplementary Materials**:

- Packing list template
- Budget calculator
- Itinerary template

**Use Case**: Efficient travel planning.

---

## Relationship & Social

### 29. Gift Ideas Aggregator (Quarterly Recurring)

**Purpose**: Compile gift ideas mentioned throughout the year

**Description**:

```
1. Search notes for gift-related mentions:
   - "they mentioned wanting..."
   - "would love to get..."
   - Direct hints
2. Organize by person
3. For each person, list:
   - Gift ideas with context
   - Interests and hobbies
   - Size/preferences
4. Flag upcoming occasions (birthdays, holidays, anniversaries)
5. Create prioritized shopping list for near-term events
6. Add links to products if specific items mentioned
```

**Recurring Schedule**: Quarterly on 15th at 14:00

**Supplementary Materials**:

- Contact birthdays/anniversaries
- Gift tracking template

**Use Case**: Never forgetting that perfect gift idea someone mentioned.

---

### 30. Social Connection Reminder (Monthly Recurring)

**Purpose**: Identify friends to reach out to

**Description**:

```
1. Review contact notes for all friends/family
2. Identify people not contacted in:
   - 1 month (close friends/family)
   - 2 months (regular friends)
   - 3 months (distant friends)
3. Create prioritized outreach list
4. For each person, note:
   - Last conversation highlights
   - Topics to ask about
   - Updates to share
5. Draft message templates or call scripts
6. Schedule check-ins on calendar
7. Create monthly connection plan
```

**Recurring Schedule**: Monthly on 1st Monday at 18:00

**Supplementary Materials**:

- Contact tracking template
- Message templates

**Use Case**: Maintaining meaningful relationships proactively.

---

## Backlog Items (Agent-Discovered)

These workflows are created by the agent while doing other work, without interrupting the user.

### 31. Consolidate Duplicate Notes

**Type**: backlog
**Purpose**: Merge 3 notes about same topic found during search

**Description**:

```
Discovered while searching for React information:
- "React Hooks Guide" (created 2024-01-15)
- "Using React Hooks" (created 2024-02-20)
- "React Hooks Notes" (created 2024-03-10)

These notes contain significant overlapping content:
- All cover useState and useEffect
- Similar examples in each
- Different bits of unique content scattered across all three

Recommendation:
1. Review each note for unique content
2. Merge into single comprehensive "React Hooks Reference"
3. Preserve all examples and insights
4. Update backlinks from other notes
5. Archive the duplicate notes
```

**Supplementary Materials**: Links to the three duplicate notes

---

### 32. Update Stale Project Status

**Type**: backlog
**Purpose**: Flag 5 project notes with status but no recent updates

**Description**:

```
Found projects marked "active" with no updates in 30+ days:

1. "Website Redesign" - status: active, last update: 45 days ago
2. "Learning Rust" - status: active, last update: 38 days ago
3. "Home Gym Setup" - status: active, last update: 62 days ago
4. "Newsletter Launch" - status: active, last update: 51 days ago
5. "Garden Planning" - status: active, last update: 34 days ago

For each project, review to:
- Mark as completed if finished
- Archive if abandoned
- Update status if still ongoing
- Add recent progress notes
```

**Supplementary Materials**: Links to each stale project note

---

### 33. Add Missing Tags

**Type**: backlog
**Purpose**: Tag untagged notes discovered in recent work

**Description**:

```
While working on machine learning research, noticed these related notes
without proper tags:

1. "Gradient Descent Explanation" - no tags
2. "Neural Network Notes from Course" - no tags
3. "Backpropagation Example" - no tags
4. "Loss Functions Overview" - no tags
5. "Overfitting Prevention" - no tags
6. "Model Evaluation Metrics" - no tags
7. "Training vs Validation Sets" - no tags
8. "Hyperparameter Tuning Notes" - no tags

Suggested tags based on content:
- machine-learning
- neural-networks
- deep-learning
- algorithms
- data-science

Adding these tags will improve discoverability when searching for ML content.
```

**Supplementary Materials**: List of note IDs to tag

---

### 34. Create Index for Scattered Topic

**Type**: backlog
**Purpose**: Build hub note for frequently-referenced topic

**Description**:

```
Noticed 15+ notes about "API design" without a central index:

Notes found:
- "REST API Best Practices"
- "GraphQL vs REST"
- "API Versioning Strategies"
- "Authentication in APIs"
- "Rate Limiting Design"
- "Error Handling Patterns"
- "API Documentation Tools"
- (8 more notes...)

This topic would benefit from a hub note providing:
- Overview of API design principles
- Links to all related notes organized by subtopic:
  * Design Patterns
  * Security
  * Documentation
  * Best Practices
  * Specific Technologies
- Quick reference guide
- Further reading resources

Recommend creating "API Design - Overview" as central hub.
```

**Supplementary Materials**: List of all related note IDs

---

### 35. Reconcile Contradictory Information

**Type**: backlog
**Purpose**: Flag notes with conflicting information

**Description**:

```
While reviewing productivity notes, found contradictory advice:

Note 1: "Morning Routine 2024" recommends:
- No phone for first hour after waking
- Meditation before any work

Note 2: "What Actually Works for Me" states:
- Checking messages first thing is fine
- Jumping straight into work is most productive

Note 3: "Productivity Experiments Log" shows:
- Best results with 30-min phone-free morning
- Meditation helps some days, not others

Recommendation:
1. Review all three notes
2. Identify actual current practice
3. Update or consolidate recommendations
4. Archive outdated approaches
5. Create "Current Morning Routine" with evidence-based approach
```

**Supplementary Materials**: Links to conflicting notes

---

### 36. Broken Link Repair Opportunities

**Type**: backlog
**Purpose**: Fix broken internal links discovered during note access

**Description**:

```
Found broken internal links while accessing recent notes:

1. "Project Planning Template" links to:
   - "Goals Framework" (note deleted)
   - Should link to "SMART Goals Guide" instead

2. "Weekly Review Process" links to:
   - "Reflection Questions" (note moved to archive)
   - New location: "Archive/Templates/Reflection Questions"

3. Multiple notes link to:
   - "Reading List 2023" (outdated)
   - Should link to "Reading List 2024"

Recommend:
- Update all links to point to correct locations
- Add redirects where possible
- Note deprecated links in changelog
```

**Supplementary Materials**: List of broken links with suggested fixes

---

## Workflow Pattern Summary

These examples demonstrate several key patterns:

### 1. Time-based Synthesis

- Weekly summaries, monthly reviews
- Combining information across time periods
- Identifying trends and patterns

### 2. Proactive Preparation

- Meeting prep, sprint planning
- Anticipating needs before they arise
- Reducing last-minute scrambling

### 3. Maintenance & Hygiene

- Link fixing, pruning, archiving
- Keeping information current and organized
- Preventing information decay

### 4. Pattern Recognition

- Habit analysis, spending review
- Extracting insights from data
- Identifying correlations

### 5. Content Transformation

- Notes → newsletter, ideas → outlines
- Repurposing information for different contexts
- Value extraction from existing work

### 6. Relationship Management

- 1-on-1 prep, social outreach
- Maintaining connections systematically
- Never losing touch

### 7. Knowledge Consolidation

- Learning reviews, literature synthesis
- Building comprehensive understanding
- Creating reference materials

### 8. Discovery & Recommendation

- Backlog items from agent observations
- Opportunistic improvements
- Leveraging AI pattern recognition

---

## Creating Your Own Workflows

When designing workflows, consider:

1. **Frequency**: How often does this need to happen?
2. **Consistency**: Does it need to happen on the same schedule?
3. **Input**: What information is needed?
4. **Output**: What should be created?
5. **Context**: What materials help the agent execute well?
6. **Value**: How much time/effort does this save?

The most valuable workflows are those that:

- Happen regularly but are easy to forget
- Require gathering information from multiple places
- Benefit from consistent execution
- Free up mental energy for creative work
- Build valuable knowledge assets over time
