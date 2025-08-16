# Wikilink Autocomplete Enhancement for Slash Commands

## Overview

This document outlines the plan to integrate wikilink autocomplete functionality into slash command text and textblock parameters, enabling users to reference notes directly within command parameters using the familiar `[[note|title]]` syntax.

## Current System Analysis

### Slash Commands Implementation Status

- ✅ Full parameterized command system with `text`, `number`, `selection`, and `textblock` parameter types
- ✅ Parameter input interface in `SlashCommandAutocomplete.svelte` with tab navigation
- ✅ `TextBlockEditor.svelte` for multi-line text input using CodeMirror
- ✅ Template expansion with `{parameterName}` placeholder syntax

### Wikilink System Status

- ✅ Comprehensive wikilink autocomplete in `WikilinkAutocomplete.svelte`
- ✅ CodeMirror extension in `wikilinks.svelte.ts` with decorations and atomic ranges
- ✅ `[[identifier|title]]` format support with note resolution
- ✅ Note creation and linking functionality

## Enhancement Strategy

### Phase 1: TextBlockEditor Wikilink Integration

**Goal:** Add wikilink autocomplete to `textblock` parameter types

**Implementation:**

1. **Extend TextBlockEditor with Wikilink Support**
   - Add wikilinks extension to TextBlockEditor's CodeMirror instance
   - Import `wikilinksExtension` from `lib/wikilinks.svelte.ts`
   - Add click handler for wikilink navigation
   - Maintain existing keyboard shortcuts (Ctrl+Enter, Escape)

2. **Wikilinks Always Enabled**
   - Wikilinks are automatically enabled for all textblock parameters
   - No configuration required - wikilinks work out of the box

**Files to Modify:**

- `src/renderer/src/components/TextBlockEditor.svelte`
- `src/renderer/src/stores/slashCommandsStore.svelte.ts`
- `src/renderer/src/components/SlashCommands.svelte`

### Phase 2: Text Parameter Wikilink Support

**Goal:** Add wikilink autocomplete to single-line `text` parameter types

**Implementation:**

1. **Create WikilinkTextInput Component**
   - New component similar to TextBlockEditor but for single-line input
   - CodeMirror single-line configuration with wikilinks extension
   - Tab/Enter key handling for parameter navigation
   - Compact styling to match existing parameter inputs

2. **Update SlashCommandAutocomplete**
   - Always render WikilinkTextInput for text parameters
   - Maintain existing tab navigation and keyboard shortcuts
   - Preserve parameter validation logic
   - Wikilinks are automatically enabled for all text parameters

**Files to Create/Modify:**

- `src/renderer/src/components/WikilinkTextInput.svelte` (new)
- `src/renderer/src/components/SlashCommandAutocomplete.svelte`

### Phase 3: Enhanced Parameter Configuration UI

**Goal:** User-friendly wikilink documentation in command management

**Implementation:**

1. **Parameter Configuration Enhancement**
   - Add contextual help text explaining wikilink functionality
   - Visual indicators showing wikilink support is always enabled
   - Documentation about `[[note|title]]` format

2. **Preview System Enhancement**
   - Update preview to show wikilink formatting
   - Demonstrate `[[note|title]]` format in parameter examples

**Files to Modify:**

- `src/renderer/src/components/SlashCommands.svelte`

### Phase 4: Advanced Wikilink Features

**Goal:** Enhanced wikilink functionality specific to slash commands

**Implementation:**

1. **Parameter-Specific Wikilink Filtering**
   - Allow filtering notes by type/tags for specific parameters
   - Add `wikilinkFilter` property to parameter configuration
   - Custom autocomplete results based on filter criteria

2. **Template Variable Wikilinks**
   - Support wikilink autocomplete within template placeholders
   - Handle complex template scenarios with multiple wikilinks

**Files to Modify:**

- `src/renderer/src/stores/slashCommandsStore.svelte.ts`
- `src/renderer/src/lib/wikilinks.svelte.ts`
- `src/renderer/src/components/SlashCommands.svelte`

## Technical Implementation Details

### Enhanced SlashCommandParameter Interface

```typescript
interface SlashCommandParameter {
  id: string;
  name: string;
  type: 'text' | 'number' | 'selection' | 'textblock';
  required: boolean;
  defaultValue?: string;
  description?: string;
  // Note: Wikilinks are always enabled for 'text' and 'textblock' types
  wikilinkFilter?: {
    // Phase 4 enhancement
    types?: string[];
    tags?: string[];
  };
}
```

### Component Architecture

```
SlashCommandAutocomplete.svelte
├── TextBlockEditor.svelte (enhanced with wikilinks)
├── WikilinkTextInput.svelte (new component - Phase 2)
├── [existing parameter inputs]
└── [parameter configuration UI enhancements]
```

### Integration Points

1. **TextBlockEditor Enhancement**: `src/renderer/src/components/TextBlockEditor.svelte:109`
   - Add wikilinks extension to createExtensions() function
   - Implement click handler for note navigation

2. **Parameter Interface**: `src/renderer/src/stores/slashCommandsStore.svelte.ts:1`
   - Extend SlashCommandParameter interface
   - Update parameter validation and processing

3. **Autocomplete Component**: `src/renderer/src/components/SlashCommandAutocomplete.svelte:240`
   - Always render WikilinkTextInput for text parameters
   - Integration with new WikilinkTextInput component

4. **Management UI**: `src/renderer/src/components/SlashCommands.svelte`
   - Parameter configuration interface enhancements
   - Wikilink documentation and preview updates

### User Experience Flow

#### Phase 1: TextBlock Parameters

1. User creates slash command with textblock parameter
2. When using the command, the textblock editor automatically supports `[[note]]` autocomplete
3. Users can click wikilinks to navigate or use keyboard shortcuts

#### Phase 2: Text Parameters

1. User creates slash command with text parameter
2. Single-line text input automatically provides wikilink autocomplete
3. Maintains existing tab navigation between parameters

#### Phase 3: Enhanced Configuration

1. Improved UI with clear wikilink documentation
2. Preview shows wikilink formatting examples
3. Contextual help explains wikilink functionality

#### Phase 4: Advanced Features

1. Parameter-specific note filtering (e.g., only show meeting notes)
2. Complex template scenarios with multiple wikilinks
3. Advanced autocomplete with type/tag filtering

## Benefits

- **Enhanced Productivity**: Users can reference notes directly within command parameters
- **Consistent UX**: Leverages existing wikilink system users already know
- **Consistent Experience**: Wikilinks work uniformly across text and textblock parameters
- **Backward Compatible**: Existing commands continue working unchanged
- **Progressive Enhancement**: Can be implemented incrementally without breaking changes

## Implementation Priority

1. **Phase 1** (High Priority): TextBlockEditor integration
   - Enables multi-line text with wikilinks
   - Leverages existing robust TextBlockEditor component
   - Provides immediate value for complex command templates

2. **Phase 2** (Medium Priority): Single-line text parameter support
   - Completes basic wikilink functionality across parameter types
   - Requires new component development

3. **Phase 3** (Medium Priority): Enhanced configuration UI
   - Improves user experience for command creation
   - Makes wikilink features discoverable

4. **Phase 4** (Low Priority): Advanced filtering and template features
   - Power-user features for complex workflows
   - Can be implemented based on user feedback

## Testing Strategy

### Phase 1 Testing

- Wikilink autocomplete functionality in textblock parameters
- Keyboard navigation (Ctrl+Enter, Escape) integration
- Click-to-navigate wikilink functionality
- Parameter validation with wikilink content

### Phase 2 Testing

- Single-line wikilink autocomplete
- Tab navigation between parameters with wikilinks
- Parameter completion workflow

### Phase 3 Testing

- Parameter configuration UI with wikilink toggles
- Preview system with wikilink formatting
- Command creation workflow

### Phase 4 Testing

- Note filtering functionality
- Complex template scenarios
- Performance with large note collections

## Success Metrics

- Users can successfully create commands with text and textblock parameters
- Wikilink autocomplete works seamlessly within parameter inputs
- Existing slash command functionality remains unaffected
- User adoption of wikilink-enhanced commands increases productivity
- System performance remains stable with wikilink integration

## Migration Considerations

- All existing slash commands continue working without changes
- Wikilinks are automatically enabled for all text and textblock parameters
- No configuration changes required for existing command definitions
- No data migration required for existing command definitions

This enhancement significantly expands the power of slash commands by enabling rich note references within command parameters, creating a more integrated and productive note-taking workflow.
