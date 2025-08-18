import { CompletionContext } from '@codemirror/autocomplete';
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
export declare function validateTemplate(template: string, parameters: SlashCommandParameter[]): TemplateValidation;
export declare function createParameterCompletions(parameters: SlashCommandParameter[]): (context: CompletionContext) => CompletionResult | null;
export declare function createTemplateParameterExtension(parameters: SlashCommandParameter[]): Extension;
export declare function inferParameterType(parameterName: string): 'text' | 'number' | 'textblock' | 'selection';
export {};
