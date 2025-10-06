/**
 * Type definitions for the Test Maker UI
 */

export type TestType = "api" | "unit" | "integration" | "e2e";

export type StepType = "request" | "input" | "call" | "scenario";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

export type AssertType =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "matches"
  | "greaterThan"
  | "lessThan"
  | "exists"
  | "notExists"
  | "statusCode"
  | "responseTime";

export interface TestVariable {
  name: string;
  value: any;
  source: string; // Which step this variable came from
  type: "string" | "number" | "boolean" | "object" | "array";
}

export interface Assert {
  id: string;
  type: AssertType;
  path: string; // JSONPath or XPath to the value to assert
  expected?: any;
  operator?: string;
  message?: string;
}

export interface Capture {
  id: string;
  name: string; // Variable name to store the captured value
  path: string; // JSONPath or XPath to the value to capture
  type: "json" | "xml" | "text" | "regex" | "header";
  pattern?: string; // For regex captures
  defaultValue?: any;
}

export interface StepDependency {
  stepId: string;
  condition?: string; // Optional condition for the dependency
}

export interface LoopConfig {
  enabled: boolean;
  iterations?: number;
  while?: string; // Condition expression
  forEach?: string; // Variable or array to iterate over
}

export interface CallConfig {
  type: "function" | "api" | "step";
  target: string; // Function name, API endpoint, or step ID
  parameters?: Record<string, any>;
}

export interface Scenario {
  id: string;
  name: string;
  condition?: string; // When this scenario should execute
  steps: TestStep[];
}

export interface TestStep {
  id: string;
  step_id?: string; // Optional step_id for referencing
  name: string;
  description?: string;
  type?: StepType; // Type of step: request, input, call, scenario

  // Request configuration (for type: "request")
  url?: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  queryParams?: Record<string, string>;

  // Input configuration (for type: "input")
  input?: Record<string, any>; // Key-value pairs for input variables

  // Validation
  asserts: Assert[];
  captures: Capture[];

  // Advanced features
  depends?: StepDependency[];
  loop?: LoopConfig;
  call?: CallConfig;
  scenario?: string; // Reference to scenario name
  timeout?: number;
  retries?: number;

  // Variables available from previous steps
  availableVariables?: TestVariable[];
}

export interface TestConfiguration {
  node_id: string; // Obrigatório - ID único do nó no sistema
  id: string;
  name: string;
  description?: string;
  type: TestType;
  baseUrl?: string;
  version: string;

  // Global configuration
  headers?: Record<string, string>;
  variables?: Record<string, any>;
  timeout?: number;

  // Test structure
  steps: TestStep[];
  scenarios?: Scenario[];

  // Metadata
  tags?: string[];
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface GeneratedTest {
  code: string;
  language: "yaml" | "json" | "typescript";
  valid: boolean;
  errors?: ValidationError[];
}

// Message types for communication between WebView and Extension
export type MessageType =
  | "generate-test"
  | "validate-url"
  | "save-draft"
  | "load-draft"
  | "copy-to-clipboard"
  | "test-generated"
  | "url-validated"
  | "draft-loaded"
  | "error";

export interface Message<T = any> {
  type: MessageType;
  payload: T;
}

export interface GenerateTestMessage extends Message<TestConfiguration> {
  type: "generate-test";
}

export interface ValidateUrlMessage extends Message<string> {
  type: "validate-url";
}

export interface SaveDraftMessage extends Message<TestConfiguration> {
  type: "save-draft";
}

export interface LoadDraftMessage extends Message<void> {
  type: "load-draft";
}

export interface CopyToClipboardMessage extends Message<string> {
  type: "copy-to-clipboard";
}

export interface TestGeneratedMessage
  extends Message<GeneratedTest & { success: boolean }> {
  type: "test-generated";
}

export interface UrlValidatedMessage
  extends Message<{ valid: boolean; error?: string }> {
  type: "url-validated";
}

export interface DraftLoadedMessage extends Message<TestConfiguration | null> {
  type: "draft-loaded";
}

export interface ErrorMessage extends Message<string> {
  type: "error";
}
