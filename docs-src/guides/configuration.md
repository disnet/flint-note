# Configuration

Learn how to configure Flint to match your preferences and workflow.

## Opening Settings

Access settings by:

- Menu: Flint > Settings (Mac) or File > Settings (Windows/Linux)
- Keyboard shortcut: `Cmd+,` (Mac) / `Ctrl+,` (Windows/Linux)

## General Settings

### Notes Directory

Choose where Flint stores your notes:

1. Open Settings > General
2. Click "Change Notes Directory"
3. Select your preferred location

**Note:** Moving the notes directory will not automatically move existing notes. You'll need to manually copy them to the new location.

### Startup Behavior

Configure what happens when Flint launches:

- Open to last viewed note
- Open to daily note
- Open to notes list

### Interface

- **Theme**: Light, Dark, or System (follows OS theme)
- **Font Size**: Adjust editor and interface text size
- **Show/Hide Sidebar**: Toggle sidebar visibility on startup

## AI Configuration

### Provider Selection

Choose your AI provider:

1. Open Settings > AI
2. Select a provider:
   - **OpenAI**: GPT-3.5, GPT-4
   - **Anthropic**: Claude models
   - **OpenRouter**: Access to multiple models

### API Keys

Configure API keys for your chosen provider:

#### OpenAI

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Enter it in Settings > AI > OpenAI API Key

#### Anthropic

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Enter it in Settings > AI > Anthropic API Key

#### OpenRouter

1. Get an API key from [openrouter.ai](https://openrouter.ai)
2. Enter it in Settings > AI > OpenRouter API Key

### Model Selection

Choose which model to use:

- Balance between speed and capability
- Consider cost per request
- Select based on your typical tasks

### Privacy Settings

- **Local Processing**: Use local models (if available)
- **Disable AI**: Turn off AI features completely
- **Clear Conversation History**: Remove stored AI conversations

## Review System

### Schedule Configuration

Customize spaced repetition intervals:

- **New Card Intervals**: Initial review timing
- **Graduating Intervals**: When cards move to long-term review
- **Maximum Interval**: Longest time between reviews
- **Ease Factor**: How difficulty affects scheduling

### Review Limits

- **Daily Review Limit**: Maximum reviews per day
- **New Cards Per Day**: Limit on new material

### Review Behavior

- **Show Answer Timer**: Display time to answer
- **Auto-advance**: Move to next card automatically
- **Review Order**: Random, Due date, or Custom

## Editor Settings

### Markdown

- **Auto-pair brackets**: Automatically close brackets and quotes
- **Smart lists**: Continue lists automatically
- **Indentation**: Spaces or tabs, indent size

### Formatting

- **Line wrapping**: Wrap long lines or scroll horizontally
- **Line numbers**: Show/hide line numbers
- **Whitespace**: Show invisible characters

### Shortcuts

Customize keyboard shortcuts:

1. Open Settings > Shortcuts
2. Click on a command to record a new shortcut
3. Press your desired key combination

## Templates

### Daily Note Template

Customize the template for daily notes:

1. Open Settings > Templates
2. Edit the "Daily Note Template"
3. Use variables like `{date}`, `{day}`, `{weather}`

### Custom Templates

Create reusable templates:

1. Click "Add Template"
2. Name your template
3. Define the content
4. Use templates via command palette

## Data & Privacy

### Backup

Configure automatic backups:

- **Backup Location**: Where to store backups
- **Backup Frequency**: How often to backup
- **Keep Backups**: How many backups to retain

### Export

Export your data:

- **Export All Notes**: Download as markdown files
- **Export Database**: Full database export for migration

### Sync

(Future feature - documentation to be added)

## Advanced

### Developer Tools

- **Enable Developer Tools**: Access browser dev tools
- **Debug Mode**: Show additional logging

### Performance

- **Database Optimization**: Rebuild database indexes
- **Clear Cache**: Remove cached data

### Reset

- **Reset Settings**: Restore default settings
- **Reset Database**: Clear all data (use with caution!)

## Troubleshooting

If you encounter issues with your configuration:

1. Try resetting to defaults
2. Check the logs in Help > Show Logs
3. Contact support or file an issue on GitHub
