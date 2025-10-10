/**
 * Types for conditional scenarios
 */

export interface ScenarioConfig {
  id: string;
  condition: string; // JMESPath or JavaScript expression
  then: {
    assert?: ScenarioAssert;
    capture?: Record<string, string>; // variable_name: jmespath_expression
  };
}

export interface ScenarioAssert {
  status_code?: number;
  body?: any; // Nested structure with operators like { equals: value }
  headers?: Record<string, any>;
  response_time_ms?: {
    max?: number;
    min?: number;
  };
}
