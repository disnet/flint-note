# Template Parameter Autocomplete Enhancement Plan

## Overview

This document outlines the plan to add autocomplete support for template parameters when configuring slash commands. This enhancement will allow users to see intelligent suggestions for parameter names while typing `{parameterName}` placeholders in the instruction template field.

## Current System Analysis

### Slash Command Configuration

- ✅ Template instruction field accepts `{parameterName}` syntax in SlashCommands.svelte:139
- ✅ Parameters are defined separately with name, type, description fields
- ✅ Template expansion happens in `expandCommandWithParameters()` in slashCommandsStore.svelte.ts:111
- ✅ No current validation that template placeholders match defined parameters

### Existing Autocomplete Infrastructure

- ✅ WikilinkTextInput.svelte provides single-line CodeMirror with autocomplete support
- ✅ TextBlockEditor.svelte provides multi-line CodeMirror with wikilink autocomplete
- ✅ `@codemirror/autocomplete` package already integrated for completions
- ✅ Wikilink extension demonstrates custom autocomplete implementation

## Enhancement Goals

### Primary Objective

Add intelligent autocomplete to the instruction template textarea that suggests:

1. **Defined Parameter Names**: Show available parameters as user types `{`
2. **Parameter Information**: Display parameter type, requirement status, and description in completion popup
3. **Validation Feedback**: Visual indicators for unused parameters or undefined placeholders

### Secondary Objectives

1. **Template Validation**: Real-time validation of template syntax
2. **Parameter Usage Tracking**: Show which parameters are used/unused in template
3. **Smart Suggestions**: Suggest creating parameters for undefined placeholders

## Implementation Strategy

### Phase 1: Template Parameter Autocomplete Component

**Goal:** Create specialized autocomplete for template parameter syntax

**Implementation:**

1. **Create TemplateParameterInput Component**
   - New component `src/renderer/src/components/TemplateParameterInput.svelte`
   - CodeMirror-based textarea with custom parameter autocomplete
   - Trigger autocomplete on `{` character
   - Show available parameters in dropdown with metadata

2. **Parameter Completion Extension**
   - Custom CodeMirror extension for parameter placeholder completion
   - Parse current parameters list to generate completions
   - Format: `{parameterName}` with type and description info
   - Handle cursor positioning after parameter insertion

**Files to Create:**

- `src/renderer/src/components/TemplateParameterInput.svelte` (new)
- `src/renderer/src/lib/templateParameters.svelte.ts` (new)

**Files to Modify:**

- `src/renderer/src/components/SlashCommands.svelte` (lines 136-142, 292-298)

### Phase 2: Template Validation and Visual Feedback

**Goal:** Add real-time validation and visual indicators

**Implementation:**

1. **Template Syntax Validation**
   - Parse template for `{parameterName}` patterns
   - Validate placeholders match defined parameters
   - Highlight invalid/undefined placeholders in red
   - Show validation errors below template field

2. **Parameter Usage Indicators**
   - Show checkmarks next to parameters used in template
   - Highlight unused parameters in parameter list
   - Suggest removing unused parameters

**Files to Modify:**

- `src/renderer/src/components/TemplateParameterInput.svelte`
- `src/renderer/src/components/SlashCommands.svelte`
- `src/renderer/src/lib/templateParameters.svelte.ts`

### Phase 3: Smart Parameter Suggestions

**Goal:** Intelligent suggestions for creating parameters

**Implementation:**

1. **Undefined Placeholder Detection**
   - Detect `{undefinedParam}` in template
   - Offer "Create Parameter" quick action
   - Auto-populate parameter configuration with suggested name

2. **Parameter Type Inference**
   - Analyze parameter name to suggest appropriate type
   - Names ending in "count", "number" → suggest number type
   - Names like "content", "description" → suggest textblock type
   - Default to text type for others

**Files to Modify:**

- `src/renderer/src/components/TemplateParameterInput.svelte`
- `src/renderer/src/components/SlashCommands.svelte`
- `src/renderer/src/stores/slashCommandsStore.svelte.ts`

## Technical Implementation Details

### TemplateParameterInput Component Interface

```typescript
interface TemplateParameterInputProps {
  value: string;
  parameters: SlashCommandParameter[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  onParameterSuggestion?: (parameterName: string, suggestedType: string) => void;
}
```

### Parameter Completion Extension

```typescript
import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

function createParameterCompletions(parameters: SlashCommandParameter[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\{[a-zA-Z]*$/);
    if (!word) return null;

    const options = parameters.map((param) => ({
      label: `{${param.name}}`,
      detail: `${param.type}${param.required ? ' (required)' : ' (optional)'}`,
      info: param.description || `${param.type} parameter`,
      apply: `{${param.name}}`
    }));

    return {
      from: word.from,
      options
    };
  };
}
```

### Template Validation Logic

```typescript
interface TemplateValidation {
  isValid: boolean;
  errors: string[];
  usedParameters: string[];
  unusedParameters: string[];
  undefinedPlaceholders: string[];
}

function validateTemplate(
  template: string,
  parameters: SlashCommandParameter[]
): TemplateValidation {
  const placeholderRegex = /\{([^}]+)\}/g;
  const placeholders = Array.from(template.matchAll(placeholderRegex)).map(
    (match) => match[1]
  );

  const parameterNames = parameters.map((p) => p.name);
  const usedParameters = placeholders.filter((p) => parameterNames.includes(p));
  const undefinedPlaceholders = placeholders.filter((p) => !parameterNames.includes(p));
  const unusedParameters = parameterNames.filter((p) => !placeholders.includes(p));

  return {
    isValid: undefinedPlaceholders.length === 0,
    errors: undefinedPlaceholders.map((p) => `Undefined parameter: {${p}}`),
    usedParameters,
    unusedParameters,
    undefinedPlaceholders
  };
}
```

## User Experience Flow

### Phase 1: Basic Autocomplete

1. User types instruction template in textarea
2. When user types `{`, autocomplete dropdown appears
3. Dropdown shows available parameters with type and description
4. User selects parameter, `{parameterName}` is inserted
5. Template field validates in real-time

### Phase 2: Visual Validation

1. Template field shows syntax highlighting
2. Valid parameters show in normal color
3. Undefined placeholders highlighted in red
4. Parameter list shows usage indicators
5. Validation errors displayed below field

### Phase 3: Smart Suggestions

1. User types `{newParam}` for undefined parameter
2. "Create Parameter" suggestion appears
3. Clicking suggestion adds parameter to configuration
4. Parameter type inferred from name pattern
5. User can adjust type and other settings

## Integration Points

### SlashCommands.svelte Integration

**Replace textarea with TemplateParameterInput:**

```svelte
<!-- Current (lines 136-142) -->
<textarea
  id="new-instruction"
  bind:value={newCommandInstruction}
  placeholder="Enter the prompt/instruction for this command... Use {'{parameterName}'} for parameters."
  rows="3"
></textarea>

<!-- Enhanced -->
<TemplateParameterInput
  bind:value={newCommandInstruction}
  parameters={newCommandParameters}
  placeholder="Enter the prompt/instruction for this command... Use {parameterName} for parameters."
  onParameterSuggestion={handleParameterSuggestion}
/>
```

### Parameter Configuration Enhancement

**Add usage indicators to parameter list:**

```svelte
{#each newCommandParameters as parameter, index (parameter.id)}
  <div class="parameter-config" class:unused={!usedParameters.includes(parameter.name)}>
    <div class="parameter-usage-indicator">
      {#if usedParameters.includes(parameter.name)}
        <span class="used-indicator">✓ Used in template</span>
      {:else}
        <span class="unused-indicator">⚠ Not used in template</span>
      {/if}
    </div>
    <!-- existing parameter configuration -->
  </div>
{/each}
```

## Benefits

- **Improved User Experience**: Intelligent autocomplete reduces typing errors and improves discovery
- **Template Validation**: Real-time validation prevents configuration errors
- **Parameter Management**: Clear visual feedback on parameter usage
- **Consistency**: Ensures template placeholders match defined parameters
- **Efficiency**: Smart suggestions speed up parameter creation workflow

## Success Metrics

- Users can easily discover available parameters while typing templates
- Template validation catches configuration errors before saving
- Parameter creation workflow becomes more intuitive
- Reduced support requests related to slash command configuration
- Increased adoption of parameterized slash commands

## Migration Considerations

- Enhancement is purely additive - no breaking changes
- Existing commands continue working without modification
- New validation is non-blocking - warnings only, not errors
- Component can be gradually rolled out to different template fields

## Implementation Priority

1. **Phase 1** (High Priority): Basic parameter autocomplete
   - Core functionality that provides immediate value
   - Leverages existing CodeMirror infrastructure
2. **Phase 2** (Medium Priority): Template validation
   - Improves configuration reliability
   - Provides better user feedback
3. **Phase 3** (Low Priority): Smart suggestions
   - Advanced feature for power users
   - Can be implemented based on user feedback

This enhancement significantly improves the slash command configuration experience by making parameter usage more discoverable, reliable, and efficient.
