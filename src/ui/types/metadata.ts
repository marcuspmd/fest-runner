/**
 * Types for test and step metadata
 */

export interface TestMetadata {
  description?: string;
  goals?: string[];
  preconditions?: string[];
  postconditions?: string[];
  related_routes?: string[];
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  estimated_duration_ms?: number;
}

export interface StepMetadata {
  skip?: string; // JavaScript/JMESPath expression
  always_run?: boolean;
  continue_on_failure?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
}

export interface DependsConfig {
  path: string;
  node_id: string;
}
