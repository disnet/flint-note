# Review System

Strengthen your understanding of notes through AI-generated challenges and spaced repetition.

## What is the Review System?

Flint's **Review System** uses **spaced repetition** to help you remember and understand important information from your notes.

**How it works:**

1. Mark notes for review
2. AI generates review challenges
3. You respond to test your understanding
4. AI provides feedback
5. Schedule next review based on performance

**Benefits:**

- **Active recall** - Test yourself, don't just re-read
- **Spaced repetition** - Review at optimal intervals
- **AI feedback** - Contextual explanations and guidance
- **Progress tracking** - See your learning over time

## The Science: Spaced Repetition

**Spaced repetition** is a learning technique where you review information at increasing intervals.

**Why it works:**

- Timing reviews just before you forget strengthens memory
- Spread out reviews = better long-term retention
- More efficient than cramming

**Flint's algorithm:**

- **Pass review** → Next review in 7 days
- **Fail review** → Next review in 1 day

Simple but effective for building long-term understanding.

## Enabling Review for Notes

### Mark Entire Notes

**Enable review on a note:**

1. Open the note
2. Click "Review" button (or right-click menu)
3. Note marked for review
4. Appears in review queue

**Via metadata:**

```markdown
---
title: Important Concept
review_enabled: true
---
```

**Via AI:**

```
You: Enable review for this note

AI: [Updates metadata: review_enabled: true]

    ✓ Review enabled for "Important Concept"
    First review scheduled for tomorrow
```

### Mark Specific Sections

**Future feature** - Mark individual sections:

```markdown
## Key Concept

<!-- review:start -->

This is the important part I want to remember.

Key points:

- Point 1
- Point 2
<!-- review:end -->
```

Only that section appears in reviews.

### Bulk Enabling

**Enable review for multiple notes:**

```
You: Enable review for all my notes tagged "important"

AI: [Searches tag:important, enables review]

    Enabled review for 12 notes:
    - API Design Principles
    - System Architecture
    - Security Guidelines
    ... (9 more)

    All scheduled for review tomorrow
```

## Review Interface

### Starting a Review Session

**Access Review:**

- Click "Review" in the workspace bar
- Or click "Review" in sidebar

**What you see:**

- Review statistics dashboard
- "Start Today's Review" button
- Notes due today/this week

**Start reviewing:**

1. Click "Start Today's Review"
2. First note loads
3. AI generates challenge
4. Review session begins

### Review Flow

**The review cycle:**

```
┌─────────────────────────────────────┐
│ 1. LOADING                          │
│    "Generating review challenge..." │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 2. PROMPTING                        │
│    AI challenge + response editor   │
│    - Read the challenge             │
│    - Think about your answer        │
│    - Type your response             │
│    - Submit (Ctrl+Enter)            │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 3. ANALYZING                        │
│    "Analyzing your response..."     │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 4. FEEDBACK                         │
│    AI feedback + Pass/Fail buttons  │
│    - Read feedback                  │
│    - Decide: Pass or Fail           │
│    - Click appropriate button       │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│ 5. NEXT NOTE                        │
│    Brief transition, then repeat    │
└─────────────────────────────────────┘
```

### Review Challenge

**AI generates a challenge** based on your note:

**Example challenges:**

**For concept notes:**

```
Explain the key principles of REST API design.
What makes an API "RESTful"?
```

**For technical notes:**

```
How would you implement authentication in this system?
What are the security considerations?
```

**For process notes:**

```
Walk through the steps of the deployment process.
What could go wrong and how do you handle it?
```

**Your response:**

- Type your answer in the editor
- Think deeply - this is active recall
- Be thorough but natural
- Press `Ctrl+Enter` / `Cmd+Enter` to submit

### AI Feedback

**The AI analyzes your response and provides:**

**What you got right:**

```
✓ You correctly identified the 6 REST principles
✓ Good explanation of statelessness
✓ Understood the client-server architecture
```

**What needs improvement:**

```
⚠ Your explanation of HATEOAS was incomplete
⚠ Didn't mention caching constraints
```

**Additional context:**

```
Your note also mentions:
- [[API Versioning Strategy]] - worth reviewing
- [[GraphQL vs REST]] - comparison for context

The caching constraint is important because...
```

**Learning opportunity:**
Feedback helps you understand gaps and make connections.

### Pass or Fail

**After reviewing feedback, choose:**

**Pass (Passed the review):**

- You understood the material
- Next review: **7 days** from now
- Material moves to long-term retention

**Fail (Need more review):**

- Still learning this material
- Next review: **1 day** from now (tomorrow)
- More frequent exposure to strengthen understanding

**Honest self-assessment:**

- Don't game the system
- Failing is okay and expected
- It means more practice, leading to better retention

### Session Controls

**During review:**

**Show Note:**

- View the original note
- Refresh your memory
- But try to recall first!

**Skip:**

- Skip this note for now
- Comes back at end of session
- Doesn't count as pass/fail

**End Session:**

- Stop reviewing
- Progress saved
- Resume later

**Keyboard shortcuts:**

- `Ctrl+Enter` / `Cmd+Enter` - Submit response
- `Escape` - End session
- `Tab` - Focus input

## Review Statistics

### Dashboard

**Review stats dashboard shows:**

**Due today:**

```
📅 Due Today: 5 notes
Ready for review now
```

**Due this week:**

```
📆 Due This Week: 12 notes
Upcoming reviews this week
```

**Total in system:**

```
📚 Total Review Notes: 47
Notes with review enabled
```

**Start button:**

```
[Start Today's Review]
```

### Session Summary

**After completing a session:**

```
Review Session Complete!

Reviewed: 5 notes
Passed: 3
Failed: 2

Time: 12 minutes
Average: 2.4 min/note

Next due:
- Tomorrow: 2 notes
- In 7 days: 3 notes
```

### Historical Stats

**View review history:**

```
You: Show my review statistics

AI: Review Statistics (past 30 days):

    Sessions completed: 24
    Total reviews: 127
    Pass rate: 73%

    Average session:
    - Duration: 15 minutes
    - Notes reviewed: 5.3

    Streaks:
    - Current: 12 days
    - Longest: 18 days

    Most reviewed notes:
    - System Architecture (12 times)
    - API Design (10 times)
    - Security Guidelines (9 times)
```

## Review Scheduling

### How Scheduling Works

**Initial review:**

- When you enable review: scheduled for tomorrow
- First test of understanding

**After first review:**

- **Pass** → 7 days
- **Fail** → 1 day

**After subsequent reviews:**

- **Pass** → Add 7 days from current date
- **Fail** → Reset to tomorrow

**Example timeline:**

```
Day 1: Enable review
Day 2: First review → PASS
Day 9: Second review → PASS
Day 16: Third review → FAIL
Day 17: Fourth review → PASS
Day 24: Fifth review → PASS
Day 31: Sixth review → ...
```

### Viewing Schedule

**See upcoming reviews:**

```
You: What reviews do I have coming up?

AI: Upcoming reviews:

    Today (5 notes):
    - System Architecture
    - API Design
    - Security Guidelines
    - Database Schema
    - Authentication Flow

    Tomorrow (3 notes):
    - REST Principles
    - Code Style Guide
    - Git Workflow

    This Week (8 notes):
    - Jan 17: 2 notes
    - Jan 18: 3 notes
    - Jan 20: 3 notes
```

### Missed Reviews

**If you miss reviews:**

- They stay in "due today" queue
- Don't disappear
- Review when ready
- No penalty, just backlog

**Catching up:**

```
You: I have 20 overdue reviews. Help me prioritize.

AI: Your 20 overdue reviews, sorted by importance:

    High priority (failed recently, need reinforcement):
    - API Authentication (failed 2 days ago)
    - Database Schema (failed 3 days ago)

    Medium priority (passed before, due for refresh):
    - System Architecture (due 1 week ago)
    - Security Guidelines (due 1 week ago)
    ... (12 more)

    Low priority (could wait):
    - Code Style (due 2 days ago)
    - Git Commands (due 3 days ago)

    Recommendation: Do high priority first (2 notes),
    then 5-10 medium priority per day.
```

## Review Best Practices

### What to Review

**Good candidates:**

- Core concepts you need to remember
- Technical knowledge (APIs, architectures, patterns)
- Processes and workflows
- Important decisions and rationale
- Learning from courses, books, papers

**Don't review:**

- Everything (overwhelming)
- Reference material (just look it up when needed)
- Temporary or time-sensitive notes
- Notes you'll naturally revisit often

**Quality over quantity:**

- Better: 20 well-chosen notes reviewed consistently
- Worse: 100 notes in review, half neglected

### How to Respond

**When answering challenges:**

**Good responses:**

```
REST principles include:
1. Client-Server: Separation of concerns...
2. Stateless: Each request contains all info...
3. Cacheable: Responses marked as cacheable or not...
...

The main benefit is scalability because...
```

**Avoid:**

```
I know this

(just copying from the note)
```

**Think and explain:**

- Use your own words
- Explain connections
- Show understanding, not memorization

### Review Rhythm

**Daily review:**

- Set aside 10-15 minutes
- Morning or evening
- Make it a habit
- Consistency > marathon sessions

**Example routine:**

```
Morning:
1. Coffee
2. Open Flint
3. Review due notes (10 min)
4. Start daily work
```

**Weekly catch-up:**

- Saturday morning
- Review anything missed
- Assess what to add/remove

### Adjusting Your System

**Too many reviews?**

- Remove less important notes from review
- Focus on core knowledge

**Too few?**

- Add more notes
- Review at broader level (concepts, not details)

**Consistently passing?**

- Consider removing from review
- Knowledge internalized
- Or keep for occasional refresh

**Consistently failing?**

- Break into smaller notes
- Add more context/examples
- Link to related notes
- Consider if it's truly important

## Integration with Other Features

### Review + Daily Notes

**Link review sessions to daily notes:**

```markdown
## Evening

Completed review session:

- 5 notes reviewed
- Passed: 3, Failed: 2
- Need to revisit [[Authentication Flow]] tomorrow
```

Track your learning journey.

### Review + AI

**AI helps with review:**

**Generate challenges:**

```
You: Create a review challenge for this note

AI: Here's a challenge for your note on "System Architecture":

    Question: Explain how the microservices communicate
    in your architecture. What are the trade-offs of
    your chosen approach vs alternatives?

    Respond when ready!
```

**Create flashcards:**

```
You: Turn the key points in this note into flashcard-style review questions

AI: Created 5 flashcard notes:

    Q1: What are the 3 layers of the system?
    Q2: Why did we choose PostgreSQL over MongoDB?
    Q3: How does the caching strategy work?
    Q4: What's the disaster recovery plan?
    Q5: How do we handle API versioning?

    Each enabled for review.
```

### Review + Tags

**Organize reviews by topic:**

```markdown
---
tags: [review, technical, api-design]
review_enabled: true
---
```

**Review by tag:**

```
You: Show me all my review notes tagged "api-design"

AI: Review notes tagged "api-design":
    - REST Principles (due tomorrow)
    - API Versioning (due in 3 days)
    - API Security (due in 5 days)
```

## Advanced Review Techniques

### Progressive Summarization

**Start detailed, compress over time:**

**First reviews:**

- Detailed responses
- Explain fully

**Later reviews:**

- More concise
- Key points only
- Shows internalization

### Spaced Review of Related Notes

**Review note clusters:**

```
Day 1: [[System Architecture Overview]]
Day 2: [[Database Design]]
Day 3: [[API Layer]]
Day 4: [[Authentication System]]
Day 5: [[Frontend Architecture]]
```

Build comprehensive understanding of a system.

### Self-Questioning

**Instead of reviewing note content, ask:**

**"Why is this important?"**

```
Why does this architecture decision matter?
What problem does it solve?
```

**"How does this connect?"**

```
How does this relate to [[Other Concept]]?
Where else have I seen this pattern?
```

**"When would I use this?"**

```
In what situations does this apply?
What are real-world examples?
```

Deeper understanding than surface recall.

### Meta-Review

**Periodically review your review system:**

**Questions to ask:**

- Which notes am I consistently passing? (remove or space out)
- Which am I consistently failing? (break down or add context)
- Are review sessions too long/short?
- Is the content still relevant?
- What's missing from my review queue?

**Adjust accordingly.**

## Troubleshooting

### Reviews Not Generating

**Problem:** AI doesn't generate challenges.

**Solutions:**

1. Check API key is valid
2. Try simpler note (complex notes may confuse AI)
3. Provide more context in note
4. Manually write challenge in note

### Too Many Reviews

**Problem:** Overwhelmed by review queue.

**Solutions:**

1. **Disable some reviews:**

   ```
   You: Disable review for notes tagged "low-priority"
   AI: [Disables review for 15 notes]
   ```

2. **Extend schedule:**
   Make your own schedule (future feature)

3. **Batch process:**
   Do extra reviews on weekends to catch up

### Feedback Not Helpful

**Problem:** AI feedback doesn't address your response.

**Solutions:**

1. Be more specific in your response
2. Note may be too complex - break into parts
3. Add more structure to original note
4. Provide feedback: "Focus on X in the feedback"

## Next Steps

- **[Daily Notes](/features/daily-notes)** - Track review progress daily
- **[AI Agent](/features/agent)** - Generate review questions
- **[Note Management](/features/notes)** - Create reviewable notes
- **[Workflows](/features/workflows)** - Automate review processes

---

**Remember:** The goal isn't to memorize everything—it's to internalize the concepts you need for your work and thinking. Review consistently, but don't let it become a burden. If you're not using the knowledge, you probably don't need to review it.
