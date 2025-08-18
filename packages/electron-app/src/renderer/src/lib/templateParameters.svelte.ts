import { CompletionContext, autocompletion } from '@codemirror/autocomplete';
import type { CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { SlashCommandParameter } from '../stores/slashCommandsStore.svelte';

interface TemplateValidation {
  isValid: boolean;
  errors: string[];
  usedParameters: string[];
  unusedParameters: string[];
  undefinedPlaceholders: string[];
}

export function validateTemplate(
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

export function createParameterCompletions(parameters: SlashCommandParameter[]) {
  return (context: CompletionContext): CompletionResult | null => {
    // Match { followed by any word characters
    const word = context.matchBefore(/\{[a-zA-Z_][a-zA-Z0-9_]*$/);
    if (!word) return null;

    const options = parameters.map((param) => ({
      label: `{${param.name}}`,
      detail: `${param.type}${param.required ? ' (required)' : ' (optional)'}`,
      info: param.description || `${param.type} parameter`,
      apply: `{${param.name}}`,
      type: 'variable'
    }));

    return {
      from: word.from,
      options,
      validFor: /^[a-zA-Z_][a-zA-Z0-9_]*$/
    };
  };
}

export function createTemplateParameterExtension(
  parameters: SlashCommandParameter[]
): Extension {
  return autocompletion({
    override: [createParameterCompletions(parameters)],
    activateOnTyping: true,
    maxRenderedOptions: 10
  });
}

export function inferParameterType(
  parameterName: string
): 'text' | 'number' | 'textblock' | 'selection' {
  const name = parameterName.toLowerCase();

  // Number patterns
  if (
    name.includes('count') ||
    name.includes('number') ||
    name.includes('limit') ||
    name.includes('max') ||
    name.includes('min')
  ) {
    return 'number';
  }

  // Textblock patterns
  if (
    name.includes('content') ||
    name.includes('description') ||
    name.includes('text') ||
    name.includes('body') ||
    name.includes('notes')
  ) {
    return 'textblock';
  }

  // Selection patterns
  if (
    name.includes('type') ||
    name.includes('category') ||
    name.includes('status') ||
    name.includes('priority')
  ) {
    return 'selection';
  }

  // Default to text
  return 'text';
}
