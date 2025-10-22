/**
 * Type definitions for Agent Input UI System
 *
 * This system allows AI agents to request structured input from users during
 * workflow execution and conversational interactions using embedded XML tags
 * in message streams.
 */

/**
 * Input type discriminator for different UI components
 */
export type AgentInputType =
  | 'confirm'      // Yes/No confirmation
  | 'select'       // Single choice from options
  | 'multiselect'  // Multiple choices from options
  | 'text'         // Single line text input
  | 'textarea'     // Multi-line text input
  | 'number'       // Numeric input
  | 'date'         // Date selection
  | 'slider';      // Range slider

/**
 * Option for select, multiselect, and slider input types
 */
export interface AgentInputOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Validation rules for input values
 */
export interface AgentInputValidation {
  required?: boolean;
  min?: number;          // For number, slider, or multiselect (min selections)
  max?: number;          // For number, slider, or multiselect (max selections)
  minLength?: number;    // For text, textarea
  maxLength?: number;    // For text, textarea
  pattern?: string;      // Regex pattern for text validation
}

/**
 * Base configuration for an agent input request
 */
export interface AgentInputConfig {
  id: string;
  inputType: AgentInputType;
  prompt: string;
  description?: string;
  options?: AgentInputOption[];
  defaultValue?: unknown;
  validation?: AgentInputValidation;
  placeholder?: string;
  helpText?: string;
  confirmText?: string;
  cancelText?: string;
  cancelable?: boolean;
}

/**
 * Specific config for confirm input type
 */
export interface ConfirmInputConfig extends AgentInputConfig {
  inputType: 'confirm';
  defaultValue?: boolean;
}

/**
 * Specific config for select input type
 */
export interface SelectInputConfig extends AgentInputConfig {
  inputType: 'select';
  options: AgentInputOption[];
  defaultValue?: string;
}

/**
 * Specific config for multiselect input type
 */
export interface MultiselectInputConfig extends AgentInputConfig {
  inputType: 'multiselect';
  options: AgentInputOption[];
  defaultValue?: string[];
}

/**
 * Specific config for text input type
 */
export interface TextInputConfig extends AgentInputConfig {
  inputType: 'text';
  defaultValue?: string;
}

/**
 * Specific config for textarea input type
 */
export interface TextareaInputConfig extends AgentInputConfig {
  inputType: 'textarea';
  defaultValue?: string;
}

/**
 * Specific config for number input type
 */
export interface NumberInputConfig extends AgentInputConfig {
  inputType: 'number';
  defaultValue?: number;
}

/**
 * Specific config for date input type
 */
export interface DateInputConfig extends AgentInputConfig {
  inputType: 'date';
  defaultValue?: string;  // ISO date string (YYYY-MM-DD)
}

/**
 * Specific config for slider input type
 */
export interface SliderInputConfig extends AgentInputConfig {
  inputType: 'slider';
  options?: AgentInputOption[];  // Optional labels for specific values
  defaultValue?: number;
}

/**
 * Result of a parsed input request from message stream
 */
export interface ParsedInputRequest {
  id: string;
  config: AgentInputConfig;
  rawMatch: string;  // The full matched tag for removal from visible text
}

/**
 * Response value from user input
 */
export interface AgentInputResponse {
  requestId: string;
  value: unknown;
  canceled: boolean;
}

/**
 * Validation error for input
 */
export interface ValidationError {
  field: string;
  message: string;
  rule: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern';
}

/**
 * State of an input request
 */
export type InputRequestState =
  | 'pending'     // Waiting for user input
  | 'submitting'  // Processing submission
  | 'completed'   // Input received
  | 'canceled'    // User canceled
  | 'error';      // Error occurred

/**
 * Active input request tracking
 */
export interface ActiveInputRequest {
  id: string;
  config: AgentInputConfig;
  state: InputRequestState;
  error?: string;
  timestamp: number;
}
