/**
 * Types for iteration/loop configuration
 */

export interface IterationConfig {
  over: string;  // Variable name or JMESPath expression to iterate over
  as: string;    // Item variable name (e.g., "item")
}
