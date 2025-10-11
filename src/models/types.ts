export interface FlowTestSuite {
  name: string;
  filePath: string;
  suite_name: string;
  base_url?: string;
  auth?: {
    type: string;
    token?: string;
  };
  steps: FlowTestStep[];
}

export interface FlowTestCallConfig {
  test: string;
  step?: string;
  isolate_context?: boolean;
  on_error?: string;
}

export interface FlowTestStep {
  name: string;
  step_id?: string;
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  };
  call?: FlowTestCallConfig;
  assert?: {
    status_code?: number;
    body?: Record<string, any>;
  };
  input?: any;
}

export type FlowTestGraphDirection = "TD" | "LR" | "BT" | "RL";

export interface FlowTestGraphConfig {
  command?: string;
  defaultDirection?: FlowTestGraphDirection;
  defaultOutput?: string;
  noOrphans?: boolean;
}

export interface TestResult {
  suite: string;
  step: string;
  status: "passed" | "failed" | "running" | "pending";
  error?: string;
  duration?: number;
}

export type TestStatus = "pending" | "running" | "passed" | "failed";

export interface SuiteResult {
  suite: string;
  filePath?: string;
  status: TestStatus;
}

export interface FlowTestConfig {
  configFile?: string;
  command: string;
  outputFormat: "json" | "html" | "both";
  timeout: number;
  retryCount: number;
  workingDirectory?: string;
  testDirectories?: string[];
  discovery?: {
    patterns?: string[];
    exclude?: string[];
  };
  interactiveInputs?: boolean;
  graph?: FlowTestGraphConfig;
  reporting?: {
    outputDir?: string;
    formats?: string[];
    html?: {
      outputSubdir?: string;
      perSuite?: boolean;
      aggregate?: boolean;
    };
    pdf?: {
      executablePath?: string;
      outputSubdir?: string;
    };
  };
}

export interface TestExecutionState {
  suitePath: string;
  stepName?: string;
  stepId?: string;
  config: FlowTestConfig;
  userInputs?: Record<string, string>;
  timestamp: number;
}

export interface UserInputRequest {
  stepName: string;
  inputName: string;
  prompt: string;
  required: boolean;
  masked?: boolean;
  type?: string;
  options?: Array<{ label: string; value: string; description?: string }>;
  defaultValue?: string;
}
