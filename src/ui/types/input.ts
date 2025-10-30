/**
 * Types for advanced input configuration
 */

export type InputType = 'text' | 'number' | 'select' | 'multiselect' | 'masked' | 'boolean';

export interface InputOption {
  value: string;
  label: string;
}

export interface InputConfig {
  prompt: string;
  variable: string;
  type: InputType;

  // Options for select/multiselect (can be JMESPath expression or static array)
  options?: string | InputOption[];

  description?: string;
  style?: 'boxed' | 'inline';
  required?: boolean;
  masked?: boolean; // For password inputs

  // Dynamic computed variables using JavaScript expressions
  dynamic?: {
    computed?: Record<string, string>; // variable_name: js_expression
  };
}
