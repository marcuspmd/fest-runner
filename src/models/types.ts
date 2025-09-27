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

export interface FlowTestStep {
  name: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  };
  assert?: {
    status_code?: number;
    body?: Record<string, any>;
  };
}

export interface TestResult {
  suite: string;
  step: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
  error?: string;
  duration?: number;
}

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed';