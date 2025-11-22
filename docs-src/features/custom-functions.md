# Custom Functions

Extend the AI agent's capabilities with custom TypeScript functions that persist across sessions.

## What are Custom Functions?

**Custom Functions** allow the AI agent to create, register, and reuse TypeScript functions that extend its capabilities beyond built-in tools.

**Key features:**
- **AI-created** - Agent writes functions in TypeScript
- **Persistent** - Functions saved across sessions
- **Reusable** - Call functions multiple times
- **Type-safe** - Full TypeScript type checking
- **Validated** - Security and performance checks

**Use cases:**
- Complex data transformations
- Custom note processing logic
- Specialized calculations
- Reusable utilities
- Domain-specific operations

## How Custom Functions Work

### The Lifecycle

**1. AI identifies need:**
```
You: I need to calculate compound interest for my
     financial planning notes

AI: I can create a custom function for compound interest
    calculations. This will make it easy to reuse.
```

**2. AI writes function:**
```typescript
function calculateCompoundInterest(
  principal: number,
  rate: number,
  years: number,
  compoundsPerYear: number = 12
): { total: number; interest: number } {
  const amount = principal * Math.pow(
    (1 + rate / compoundsPerYear),
    compoundsPerYear * years
  );

  return {
    total: amount,
    interest: amount - principal
  };
}
```

**3. Function registered:**
```
AI: ✓ Created custom function: calculateCompoundInterest

    Parameters:
    - principal: number (required)
    - rate: number (required)
    - years: number (required)
    - compoundsPerYear: number (optional, default: 12)

    Returns: { total: number; interest: number }

    This function is now available in all conversations.
```

**4. AI uses function:**
```
You: Calculate the value of $10,000 at 5% for 10 years

AI: [Calls calculateCompoundInterest(10000, 0.05, 10)]

    With monthly compounding:
    - Initial: $10,000
    - After 10 years: $16,470.09
    - Interest earned: $6,470.09
```

### Function Registration

**Functions are registered with:**
- **Unique ID** - Generated identifier
- **Name** - Function name (must be valid TypeScript identifier)
- **Description** - What the function does
- **Parameters** - Type definitions for each parameter
- **Return type** - What the function returns
- **Code** - TypeScript implementation
- **Tags** - For organization and discovery
- **Metadata** - Creation date, usage count, version

**Storage:**
- Persisted to vault database
- Available across all conversations
- Survives app restarts
- Per-vault isolation

## Function Definition

### Function Structure

**Required components:**

```typescript
/**
 * Function name: processNoteContent
 *
 * Description: Extract headers and create a table of contents
 *
 * Parameters:
 * - content: string - Markdown content to process
 * - maxDepth: number (optional, default: 3) - Maximum header depth
 *
 * Returns: string - Table of contents markdown
 */
function processNoteContent(
  content: string,
  maxDepth: number = 3
): string {
  const lines = content.split('\n');
  const headers = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      if (level <= maxDepth) {
        headers.push({
          level,
          text: match[2]
        });
      }
    }
  }

  return headers
    .map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`)
    .join('\n');
}
```

### Parameter Types

**Supported types:**

**Primitives:**
```typescript
string
number
boolean
```

**Objects:**
```typescript
object
Record<string, any>
{ key: string; value: number }
```

**Arrays:**
```typescript
string[]
Array<{ id: string; data: any }>
```

**Complex types:**
```typescript
"strict" | "loose"  // Union types
((item: any) => boolean) | null  // Function types
Promise<{ processed: number; results: any[] }>  // Promises
```

**Optional parameters:**
```typescript
Parameters {
  required: { type: 'string' },
  optional: {
    type: 'number',
    optional: true,
    default: 10
  }
}
```

### Return Types

**Can return:**
- Primitives: `string`, `number`, `boolean`
- Objects: `{ key: value }`
- Arrays: `any[]`
- Promises: `Promise<any>`
- Complex nested types

**Type safety enforced:**
```typescript
// Return type must match implementation
function getCount(): number {
  return "5";  // ❌ Type error
}

function getCount(): number {
  return 5;  // ✓ Valid
}
```

## Creating Functions

### Via AI Initiative

**AI proposes function creation:**

```
You: I keep needing to format dates in my notes consistently

AI: I can create a custom function to handle date formatting
    consistently. This will ensure all your dates use the
    same format across notes.

    Should I create a formatDate function that accepts a date
    and returns it in your preferred format?

You: Yes, use YYYY-MM-DD format

AI: [Creates function]

    ✓ Created function: formatDate
    - Accepts: Date object or ISO string
    - Returns: YYYY-MM-DD formatted string
    - Tagged: date, formatting, utility
```

### Via User Request

**Explicit request:**

```
You: Create a function that calculates the reading time
     for a markdown note based on word count

AI: I'll create a reading time calculator.

    [Creates function]

    function calculateReadingTime(
      content: string,
      wordsPerMinute: number = 200
    ): { words: number; minutes: number; displayTime: string } {
      // Remove code blocks and markdown syntax
      const text = content
        .replace(/```[\\s\\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/[#*_\\[\\]()]/g, '');

      const words = text.trim().split(/\\s+/).length;
      const minutes = Math.ceil(words / wordsPerMinute);
      const displayTime = minutes === 1 ? '1 minute' : `${minutes} minutes`;

      return { words, minutes, displayTime };
    }

    ✓ Created function: calculateReadingTime
    - Default: 200 words per minute
    - Returns word count and reading time
```

## Using Custom Functions

### In Conversations

**AI calls functions naturally:**

```
You: How long would it take to read my "System Design" note?

AI: [Calls calculateReadingTime on note content]

    Your "System Design" note:
    - 2,847 words
    - ~14 minutes to read
    - At 200 words per minute
```

**Functions are tools:**
- Listed with built-in tools
- AI selects when appropriate
- Can chain multiple function calls

### Function Discovery

**List available functions:**

```
You: What custom functions do I have?

AI: You have 5 custom functions:

    Date & Time:
    - formatDate: Format dates consistently (YYYY-MM-DD)
    - parseRelativeDate: Parse "tomorrow", "next week", etc.

    Note Processing:
    - calculateReadingTime: Estimate reading time
    - extractWikilinks: Find all wikilinks in content

    Finance:
    - calculateCompoundInterest: Compound interest calculator

    Usage stats:
    - formatDate: 47 calls
    - calculateReadingTime: 23 calls
    - extractWikilinks: 15 calls
    - parseRelativeDate: 8 calls
    - calculateCompoundInterest: 3 calls
```

**Search by tag:**

```
You: Show me functions tagged "finance"

AI: Functions tagged "finance":

    1. calculateCompoundInterest
       - Calculate compound interest
       - Used 3 times
       - Created: Jan 15, 2024

    2. calculateROI
       - Return on investment calculator
       - Used 1 time
       - Created: Jan 20, 2024
```

## Function Management

### Updating Functions

**Modify existing functions:**

```
You: Update the formatDate function to also handle
     ISO datetime strings

AI: I'll update formatDate to handle full datetimes.

    [Updates function]

    ✓ Updated function: formatDate (v2)
    - Now accepts: Date, ISO date string, or ISO datetime
    - Returns: YYYY-MM-DD format
    - Strips time if present
    - Backward compatible with existing calls

    Previous version (v1) archived.
```

**Version tracking:**
- Each update increments version
- Usage count preserved
- Previous version archived

### Deleting Functions

**Remove unused functions:**

```
You: Delete the old ROI calculator

AI: Are you sure? This function has been used 1 time.

You: Yes

AI: [Deletes function]

    ✓ Deleted function: calculateROI
    - Permanently removed from vault
    - Cannot be undone
```

**Caution:**
- Deletion is permanent
- Check usage count first
- Consider archiving instead

### Function Tags

**Organize with tags:**

```
Function: calculateCompoundInterest
Tags: ["finance", "calculator", "interest"]
```

**Benefits:**
- Group related functions
- Aid discovery
- Filter by category

**Common tag patterns:**
- By domain: `finance`, `dates`, `formatting`
- By type: `calculator`, `parser`, `formatter`
- By purpose: `note-processing`, `data-analysis`

## Validation and Security

### Security Validation

**Functions are checked for unsafe operations:**

**Blocked patterns:**
```typescript
// ❌ eval() calls
eval('malicious code');

// ❌ Function constructor
new Function('return dangerous');

// ❌ require() calls
require('fs');

// ❌ process.env access
process.env.SECRET;

// ❌ Global object modification
global.malicious = 'value';
```

**Allowed patterns:**
```typescript
// ✓ Standard JavaScript
Math.sqrt(16);

// ✓ String manipulation
text.split(' ');

// ✓ Array operations
items.filter(x => x.value > 0);

// ✓ Object operations
Object.keys(data);

// ✓ JSON operations
JSON.parse('{}');
```

### Syntax Validation

**TypeScript compilation:**
- Code must be valid TypeScript
- Type errors caught before registration
- Helpful error messages

**Example validation errors:**

```
AI: Unable to create function - validation errors:

    Line 5: Type 'string' is not assignable to type 'number'
    Line 8: Function lacks ending return statement

    Should I fix these issues?
```

### Performance Validation

**Functions are checked for:**

**Warning patterns:**
```typescript
// ⚠ Infinite loops
while (true) { ... }

// ⚠ Large iterations
for (let i = 0; i < 1000000; i++) { ... }

// ⚠ Synchronous delays
for (let i = 0; i < 1000; i++) {
  // Blocking operation
}
```

**Recommendations provided:**
```
AI: Function created, but I noticed a potential performance issue:
    - Line 12: Loop may iterate many times
    - Consider adding a maximum iteration limit
    - Or make the function async for large datasets
```

## Function Examples

### Date Utilities

**Parse relative dates:**
```typescript
function parseRelativeDate(input: string): Date {
  const today = new Date();
  const normalized = input.toLowerCase().trim();

  switch (normalized) {
    case 'today':
      return today;
    case 'tomorrow':
      return new Date(today.setDate(today.getDate() + 1));
    case 'yesterday':
      return new Date(today.setDate(today.getDate() - 1));
    case 'next week':
      return new Date(today.setDate(today.getDate() + 7));
    default:
      return new Date(input); // Fallback to parsing
  }
}
```

**Usage:**
```
You: Create a note for next week's meeting

AI: [Calls parseRelativeDate("next week")]
    [Calculates: 2024-01-29]

    Created: [[Meeting - 2024-01-29]]
```

### Note Processing

**Extract wikilinks:**
```typescript
function extractWikilinks(content: string): string[] {
  const wikilinks: string[] = [];
  const regex = /\\[\\[([^\\]]+)\\]\\]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    wikilinks.push(match[1]);
  }

  return [...new Set(wikilinks)]; // Remove duplicates
}
```

**Usage:**
```
You: List all notes referenced in my project note

AI: [Reads note]
    [Calls extractWikilinks(content)]

    Your "Project Overview" references 8 notes:
    - System Architecture
    - API Design
    - Database Schema
    ...
```

### Data Transformation

**Parse markdown tables:**
```typescript
function parseMarkdownTable(
  markdown: string
): Array<Record<string, string>> {
  const lines = markdown.trim().split('\\n');

  // Extract headers
  const headers = lines[0]
    .split('|')
    .map(h => h.trim())
    .filter(h => h);

  // Skip separator line
  const rows = lines.slice(2);

  return rows.map(row => {
    const cells = row.split('|').map(c => c.trim()).filter(c => c);
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = cells[i] || '';
    });
    return obj;
  });
}
```

**Usage:**
```
You: Convert the table in my data note to a summary

AI: [Reads note]
    [Calls parseMarkdownTable(content)]
    [Processes data]

    Summary of your data table:
    - 15 rows
    - Average score: 78.5
    - Top performer: Alice (95)
```

## Advanced Patterns

### Async Functions

**Use Promises for async operations:**

```typescript
async function fetchAndProcessData(
  url: string,
  timeout: number = 5000
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

**Note:** External network access depends on app permissions.

### Function Composition

**Functions can call each other:**

```typescript
// Function 1: Date formatter
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Function 2: Uses formatDate
function createDailyNoteTitle(offset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `Daily Note - ${formatDate(date)}`;
}
```

**AI can chain calls:**
```
AI: [Calls createDailyNoteTitle(1)]
    [Which calls formatDate(...)]

    Creating: "Daily Note - 2024-01-23"
```

### Higher-Order Functions

**Functions accepting callbacks:**

```typescript
function processNoteBatch(
  noteIds: string[],
  processor: (content: string) => string,
  batchSize: number = 10
): { processed: number; results: string[] } {
  const results: string[] = [];
  let processed = 0;

  for (let i = 0; i < noteIds.length; i += batchSize) {
    const batch = noteIds.slice(i, i + batchSize);

    for (const id of batch) {
      // Read note (simplified)
      const content = `Note ${id} content`;
      const result = processor(content);
      results.push(result);
      processed++;
    }
  }

  return { processed, results };
}
```

## Best Practices

### Function Naming

**Clear, descriptive names:**

**Good:**
```
calculateReadingTime
parseMarkdownTable
formatDate
extractWikilinks
```

**Bad:**
```
calc
process
doIt
utils
```

### Function Size

**Keep functions focused:**

**Good:** One function, one purpose
```typescript
function countWords(text: string): number {
  return text.trim().split(/\\s+/).length;
}

function calculateReadingTime(text: string, wpm: number = 200): number {
  return Math.ceil(countWords(text) / wpm);
}
```

**Bad:** Doing too much
```typescript
function processEverything(text: string): any {
  // Counts words
  // Calculates reading time
  // Extracts wikilinks
  // Formats dates
  // ... (50 more lines)
}
```

### Error Handling

**Handle errors gracefully:**

```typescript
function safeJSONParse(
  json: string
): { success: boolean; data?: any; error?: string } {
  try {
    const data = JSON.parse(json);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Parse failed'
    };
  }
}
```

**Better than throwing:**
- AI can handle failures gracefully
- Provides informative error messages
- Doesn't crash workflow

### Documentation

**Write clear descriptions:**

```typescript
/**
 * Calculate compound interest
 *
 * Takes a principal amount, interest rate, time period, and
 * compounding frequency to calculate the final amount and
 * total interest earned.
 *
 * Example: calculateCompoundInterest(10000, 0.05, 10, 12)
 * Returns: { total: 16470.09, interest: 6470.09 }
 */
function calculateCompoundInterest(
  principal: number,
  rate: number,
  years: number,
  compoundsPerYear: number = 12
): { total: number; interest: number } {
  // ...
}
```

**Helps AI understand when to use function.**

## Troubleshooting

### Function Not Available

**Problem:** AI doesn't use your custom function.

**Solutions:**

1. **Check if function exists:**
   ```
   You: List custom functions
   AI: [Shows functions]
   ```

2. **Check function name:**
   Function might have different name than expected

3. **Provide hint:**
   ```
   You: Use the calculateReadingTime function on this note
   AI: [Uses function]
   ```

### Validation Errors

**Problem:** Function won't register due to errors.

**Check error message:**
```
AI: Cannot create function - validation errors:

    Syntax error on line 8:
    - Expected '}' but found 'return'

    Should I help you fix this?
```

**Common issues:**
- Missing closing braces
- Type mismatches
- Security violations

### Performance Issues

**Problem:** Function takes too long to execute.

**Optimize:**
```typescript
// ❌ Slow: Nested loops
function findDuplicates(items: any[]): any[] {
  const duplicates = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i] === items[j]) {
        duplicates.push(items[i]);
      }
    }
  }
  return duplicates;
}

// ✓ Fast: Use Set
function findDuplicates(items: any[]): any[] {
  const seen = new Set();
  const duplicates = new Set();

  for (const item of items) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }

  return Array.from(duplicates);
}
```

## Next Steps

- **[Workflows](/features/workflows)** - Use functions in workflows
- **[AI Assistant](/features/agent)** - AI creates and uses functions
- **[TypeScript Guide](/guides/typescript)** - Learn TypeScript syntax
- **[Advanced Automation](/guides/automation)** - Combine features

---

**Remember:** Custom functions are powerful but start simple. Create functions when you find yourself repeatedly asking the AI to do the same transformation or calculation. Let the need drive the creation, not the other way around.
