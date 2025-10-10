import {
  TestConfiguration,
  TestStep,
  Assert,
  Capture,
  GeneratedTest,
} from "../types";

/**
 * Service responsible for generating test code from configuration
 */
export class CodeGeneratorService {
  /**
   * Generates YAML test code from configuration
   */
  public generateYaml(config: TestConfiguration): GeneratedTest {
    try {
      const yaml = this._buildYamlTest(config);
      return {
        code: yaml,
        language: "yaml",
        valid: true,
      };
    } catch (error: any) {
      return {
        code: "",
        language: "yaml",
        valid: false,
        errors: [
          {
            field: "general",
            message: error.message,
            severity: "error",
          },
        ],
      };
    }
  }

  /**
   * Generates JSON test code from configuration
   */
  public generateJson(config: TestConfiguration): GeneratedTest {
    try {
      const json = JSON.stringify(this._buildJsonTest(config), null, 2);
      return {
        code: json,
        language: "json",
        valid: true,
      };
    } catch (error: any) {
      return {
        code: "",
        language: "json",
        valid: false,
        errors: [
          {
            field: "general",
            message: error.message,
            severity: "error",
          },
        ],
      };
    }
  }

  /**
   * Builds YAML test structure
   */
  private _buildYamlTest(config: TestConfiguration): string {
    // UPDATED: Use suite_name and base_url (snake_case)
    const suiteName = config.suite_name || config.name || 'Unnamed Test';
    const baseUrl = config.base_url || config.baseUrl;

    let yaml = `# ${suiteName}\n`;
    if (config.description) {
      yaml += `# ${config.description}\n`;
    }
    yaml += `\nsuite_name: "${suiteName}"\n`;
    yaml += `node_id: "${config.node_id}"\n`;

    if (config.description) {
      yaml += `description: "${config.description}"\n`;
    }

    // Base URL (snake_case)
    if (baseUrl) {
      yaml += `base_url: "${baseUrl}"\n\n`;
    }

    // NEW: Dependencies
    if (config.depends && config.depends.length > 0) {
      yaml += `depends:\n`;
      for (const dep of config.depends) {
        yaml += `  - path: "${dep.path}"\n`;
        yaml += `    node_id: "${dep.node_id}"\n`;
      }
      yaml += `\n`;
    }

    // Global variables
    if (config.variables && Object.keys(config.variables).length > 0) {
      yaml += `variables:\n`;
      for (const [key, value] of Object.entries(config.variables)) {
        yaml += `  ${key}: ${this._formatYamlValue(value)}\n`;
      }
      yaml += `\n`;
    }

    // NEW: Exports
    if (config.exports && config.exports.length > 0) {
      yaml += `exports:\n`;
      for (const exportVar of config.exports) {
        yaml += `  - "${exportVar}"\n`;
      }
      yaml += `\n`;
    }

    // Global headers
    if (config.headers && Object.keys(config.headers).length > 0) {
      yaml += `headers:\n`;
      for (const [key, value] of Object.entries(config.headers)) {
        yaml += `  ${key}: "${value}"\n`;
      }
      yaml += `\n`;
    }

    // Timeout
    if (config.timeout) {
      yaml += `timeout: ${config.timeout}\n\n`;
    }

    // Steps
    yaml += `steps:\n`;
    for (const step of config.steps) {
      yaml += this._buildYamlStep(step);
    }

    // Scenarios
    if (config.scenarios && config.scenarios.length > 0) {
      yaml += `\nscenarios:\n`;
      for (const scenario of config.scenarios) {
        yaml += `  - name: ${scenario.name}\n`;
        if (scenario.condition) {
          yaml += `    condition: "${scenario.condition}"\n`;
        }
        yaml += `    steps:\n`;
        for (const step of scenario.steps) {
          yaml += this._buildYamlStep(step, "      ");
        }
      }
    }

    return yaml;
  }

  /**
   * Builds a single YAML step
   */
  private _buildYamlStep(step: TestStep, indent: string = "  "): string {
    let yaml = `${indent}- name: ${step.name}\n`;

    // Step ID (optional)
    if (step.step_id) {
      yaml += `${indent}  step_id: "${step.step_id}"\n`;
    }

    // NEW: Iteration configuration
    if (step.iterate) {
      yaml += `${indent}  iterate:\n`;
      yaml += `${indent}    over: "${step.iterate.over}"\n`;
      yaml += `${indent}    as: "${step.iterate.as}"\n`;
    }

    if (step.description) {
      yaml += `${indent}  description: "${step.description}"\n`;
    }

    // Step Type (default: request)
    const stepType = step.type || "request";
    if (stepType !== "request") {
      yaml += `${indent}  type: ${stepType}\n`;
    }

    // Type-specific configuration
    if (stepType === "request") {
      // Request configuration
      if (step.url) {
        yaml += `${indent}  url: "${step.url}"\n`;
      }

      if (step.method) {
        yaml += `${indent}  method: ${step.method}\n`;
      }

      if (step.headers && Object.keys(step.headers).length > 0) {
        yaml += `${indent}  headers:\n`;
        for (const [key, value] of Object.entries(step.headers)) {
          yaml += `${indent}    ${key}: "${value}"\n`;
        }
      }

      if (step.queryParams && Object.keys(step.queryParams).length > 0) {
        yaml += `${indent}  queryParams:\n`;
        for (const [key, value] of Object.entries(step.queryParams)) {
          yaml += `${indent}    ${key}: "${value}"\n`;
        }
      }

      if (step.body) {
        yaml += `${indent}  body: ${this._formatYamlValue(
          step.body,
          `${indent}    `
        )}\n`;
      }

      // Asserts
      if (step.asserts && step.asserts.length > 0) {
        yaml += `${indent}  asserts:\n`;
        for (const assert of step.asserts) {
          yaml += this._buildYamlAssert(assert, `${indent}    `);
        }
      }

      // Captures
      if (step.captures && step.captures.length > 0) {
        yaml += `${indent}  captures:\n`;
        for (const capture of step.captures) {
          yaml += this._buildYamlCapture(capture, `${indent}    `);
        }
      }
    }

    // NEW: Advanced Input Configuration (applies after request if present)
    if (step.input && step.input.length > 0) {
      yaml += `${indent}  input:\n`;
      for (const input of step.input) {
        yaml += this._buildYamlInput(input, `${indent}    `);
      }
    }

    // NEW: Scenarios configuration
    if (step.scenarios && step.scenarios.length > 0) {
      yaml += `${indent}  scenarios:\n`;
      for (const scenario of step.scenarios) {
        yaml += this._buildYamlScenario(scenario, `${indent}    `);
      }
    }

    if (stepType === "call") {
      // Call configuration
      if (step.call) {
        yaml += `${indent}  call:\n`;
        yaml += `${indent}    type: ${step.call.type || "function"}\n`;
        if (step.call.target) {
          yaml += `${indent}    target: "${step.call.target}"\n`;
        }
      }
    } else if (stepType === "scenario") {
      // Scenario reference
      if (step.scenario) {
        yaml += `${indent}  scenario: "${step.scenario}"\n`;
      }
    }

    // Dependencies (applies to all step types)
    if (step.depends && step.depends.length > 0) {
      yaml += `${indent}  depends:\n`;
      for (const dep of step.depends) {
        yaml += `${indent}    - ${dep.stepId}\n`;
        if (dep.condition) {
          yaml += `${indent}      condition: "${dep.condition}"\n`;
        }
      }
    }

    // Loop configuration (applies to all step types)
    if (step.loop?.enabled) {
      yaml += `${indent}  loop:\n`;
      if (step.loop.iterations) {
        yaml += `${indent}    iterations: ${step.loop.iterations}\n`;
      }
      if (step.loop.while) {
        yaml += `${indent}    while: "${step.loop.while}"\n`;
      }
      if (step.loop.forEach) {
        yaml += `${indent}    forEach: "${step.loop.forEach}"\n`;
      }
    }

    // Call configuration
    if (step.call) {
      yaml += `${indent}  call:\n`;
      yaml += `${indent}    type: ${step.call.type}\n`;
      yaml += `${indent}    target: "${step.call.target}"\n`;
      if (
        step.call.parameters &&
        Object.keys(step.call.parameters).length > 0
      ) {
        yaml += `${indent}    parameters:\n`;
        for (const [key, value] of Object.entries(step.call.parameters)) {
          yaml += `${indent}      ${key}: ${this._formatYamlValue(value)}\n`;
        }
      }
    }

    // Timeout and retries
    if (step.timeout) {
      yaml += `${indent}  timeout: ${step.timeout}\n`;
    }
    if (step.retries) {
      yaml += `${indent}  retries: ${step.retries}\n`;
    }

    return yaml;
  }

  /**
   * Builds a YAML assert
   */
  private _buildYamlAssert(assert: Assert, indent: string): string {
    let yaml = `${indent}- type: ${assert.type}\n`;
    yaml += `${indent}  path: "${assert.path}"\n`;
    if (assert.expected !== undefined) {
      yaml += `${indent}  expected: ${this._formatYamlValue(
        assert.expected
      )}\n`;
    }
    if (assert.operator) {
      yaml += `${indent}  operator: "${assert.operator}"\n`;
    }
    if (assert.message) {
      yaml += `${indent}  message: "${assert.message}"\n`;
    }
    return yaml;
  }

  /**
   * Builds a YAML capture
   */
  private _buildYamlCapture(capture: Capture, indent: string): string {
    let yaml = `${indent}- name: ${capture.name}\n`;
    yaml += `${indent}  path: "${capture.path}"\n`;
    yaml += `${indent}  type: ${capture.type}\n`;
    if (capture.pattern) {
      yaml += `${indent}  pattern: "${capture.pattern}"\n`;
    }
    if (capture.defaultValue !== undefined) {
      yaml += `${indent}  defaultValue: ${this._formatYamlValue(
        capture.defaultValue
      )}\n`;
    }
    return yaml;
  }

  /**
   * Builds a YAML input (advanced input configuration)
   */
  private _buildYamlInput(input: any, indent: string): string {
    let yaml = `${indent}- prompt: "${input.prompt}"\n`;
    yaml += `${indent}  variable: "${input.variable}"\n`;
    yaml += `${indent}  type: "${input.type}"\n`;

    // Options (can be JMESPath string or array of objects)
    if (input.options) {
      if (typeof input.options === 'string') {
        // JMESPath expression
        yaml += `${indent}  options: "${input.options}"\n`;
      } else if (Array.isArray(input.options)) {
        // Static array of options
        yaml += `${indent}  options:\n`;
        for (const opt of input.options) {
          yaml += `${indent}    - value: "${opt.value}"\n`;
          yaml += `${indent}      label: "${opt.label}"\n`;
        }
      }
    }

    if (input.description) {
      yaml += `${indent}  description: "${input.description}"\n`;
    }

    if (input.style) {
      yaml += `${indent}  style: "${input.style}"\n`;
    }

    if (input.required !== undefined) {
      yaml += `${indent}  required: ${input.required}\n`;
    }

    if (input.masked !== undefined) {
      yaml += `${indent}  masked: ${input.masked}\n`;
    }

    // Dynamic computed variables
    if (input.dynamic?.computed) {
      yaml += `${indent}  dynamic:\n`;
      yaml += `${indent}    computed:\n`;
      for (const [key, expr] of Object.entries(input.dynamic.computed)) {
        yaml += `${indent}      ${key}: "${expr}"\n`;
      }
    }

    return yaml;
  }

  /**
   * Builds a YAML scenario (conditional scenario)
   */
  private _buildYamlScenario(scenario: any, indent: string): string {
    let yaml = `${indent}- condition: "${scenario.condition}"\n`;
    yaml += `${indent}  then:\n`;

    // Scenario assertions
    if (scenario.then.assert) {
      yaml += `${indent}    assert:\n`;
      const assert = scenario.then.assert;

      if (assert.status_code !== undefined) {
        yaml += `${indent}      status_code: ${assert.status_code}\n`;
      }

      if (assert.body) {
        yaml += `${indent}      body:\n`;
        yaml += this._buildNestedObject(assert.body, `${indent}        `);
      }

      if (assert.response_time_ms) {
        yaml += `${indent}      response_time_ms:\n`;
        if (assert.response_time_ms.max !== undefined) {
          yaml += `${indent}        max: ${assert.response_time_ms.max}\n`;
        }
        if (assert.response_time_ms.min !== undefined) {
          yaml += `${indent}        min: ${assert.response_time_ms.min}\n`;
        }
      }
    }

    // Scenario captures
    if (scenario.then.capture) {
      yaml += `${indent}    capture:\n`;
      for (const [key, value] of Object.entries(scenario.then.capture)) {
        yaml += `${indent}      ${key}: "${value}"\n`;
      }
    }

    return yaml;
  }

  /**
   * Builds nested object for YAML (used in assertions)
   */
  private _buildNestedObject(obj: any, indent: string): string {
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${indent}${key}:\n`;
        yaml += this._buildNestedObject(value, `${indent}  `);
      } else {
        yaml += `${indent}${key}: ${this._formatYamlValue(value)}\n`;
      }
    }

    return yaml;
  }

  /**
   * Formats a value for YAML output
   */
  private _formatYamlValue(value: any, indent: string = ""): string {
    if (value === null) {
      return "null";
    }
    if (typeof value === "string") {
      return `"${value}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `\n${indent}  - ${value
        .map((v) => this._formatYamlValue(v))
        .join(`\n${indent}  - `)}`;
    }
    if (typeof value === "object") {
      let result = "\n";
      for (const [key, val] of Object.entries(value)) {
        result += `${indent}  ${key}: ${this._formatYamlValue(
          val,
          indent + "  "
        )}\n`;
      }
      return result;
    }
    return String(value);
  }

  /**
   * Builds JSON test structure
   */
  private _buildJsonTest(config: TestConfiguration): any {
    const test: any = {
      name: config.name,
      version: config.version || "1.0",
    };

    if (config.description) {
      test.description = config.description;
    }

    if (config.baseUrl) {
      test.baseUrl = config.baseUrl;
    }

    if (config.headers && Object.keys(config.headers).length > 0) {
      test.headers = config.headers;
    }

    if (config.variables && Object.keys(config.variables).length > 0) {
      test.variables = config.variables;
    }

    if (config.timeout) {
      test.timeout = config.timeout;
    }

    test.steps = config.steps.map((step) => this._buildJsonStep(step));

    if (config.scenarios && config.scenarios.length > 0) {
      test.scenarios = config.scenarios.map((scenario) => ({
        name: scenario.name,
        condition: scenario.condition,
        steps: scenario.steps.map((step) => this._buildJsonStep(step)),
      }));
    }

    if (config.tags) {
      test.tags = config.tags;
    }

    return test;
  }

  /**
   * Builds a single JSON step
   */
  private _buildJsonStep(step: TestStep): any {
    const jsonStep: any = {
      name: step.name,
    };

    if (step.description) {
      jsonStep.description = step.description;
    }

    if (step.url) {
      jsonStep.url = step.url;
    }

    if (step.method) {
      jsonStep.method = step.method;
    }

    if (step.headers && Object.keys(step.headers).length > 0) {
      jsonStep.headers = step.headers;
    }

    if (step.queryParams && Object.keys(step.queryParams).length > 0) {
      jsonStep.queryParams = step.queryParams;
    }

    if (step.body) {
      jsonStep.body = step.body;
    }

    if (step.asserts && step.asserts.length > 0) {
      jsonStep.asserts = step.asserts.map((assert) => ({
        type: assert.type,
        path: assert.path,
        ...(assert.expected !== undefined && { expected: assert.expected }),
        ...(assert.operator && { operator: assert.operator }),
        ...(assert.message && { message: assert.message }),
      }));
    }

    if (step.captures && step.captures.length > 0) {
      jsonStep.captures = step.captures.map((capture) => ({
        name: capture.name,
        path: capture.path,
        type: capture.type,
        ...(capture.pattern && { pattern: capture.pattern }),
        ...(capture.defaultValue !== undefined && {
          defaultValue: capture.defaultValue,
        }),
      }));
    }

    if (step.depends && step.depends.length > 0) {
      jsonStep.depends = step.depends;
    }

    if (step.loop?.enabled) {
      jsonStep.loop = {
        ...(step.loop.iterations && { iterations: step.loop.iterations }),
        ...(step.loop.while && { while: step.loop.while }),
        ...(step.loop.forEach && { forEach: step.loop.forEach }),
      };
    }

    if (step.call) {
      jsonStep.call = step.call;
    }

    if (step.timeout) {
      jsonStep.timeout = step.timeout;
    }

    if (step.retries) {
      jsonStep.retries = step.retries;
    }

    return jsonStep;
  }

  /**
   * Validates test configuration
   */
  public validate(config: TestConfiguration): {
    valid: boolean;
    errors: any[];
  } {
    const errors: any[] = [];

    if (!config.name || config.name.trim() === "") {
      errors.push({
        field: "name",
        message: "Test name is required",
        severity: "error",
      });
    }

    if (!config.steps || config.steps.length === 0) {
      errors.push({
        field: "steps",
        message: "At least one step is required",
        severity: "error",
      });
    }

    // Validate each step
    config.steps.forEach((step, index) => {
      if (!step.name || step.name.trim() === "") {
        errors.push({
          field: `steps[${index}].name`,
          message: `Step ${index + 1} must have a name`,
          severity: "error",
        });
      }

      // Validate dependencies
      if (step.depends) {
        step.depends.forEach((dep) => {
          const dependentStep = config.steps.find((s) => s.id === dep.stepId);
          if (!dependentStep) {
            errors.push({
              field: `steps[${index}].depends`,
              message: `Step "${step.name}" depends on non-existent step "${dep.stepId}"`,
              severity: "error",
            });
          }
        });
      }
    });

    return {
      valid: errors.filter((e) => e.severity === "error").length === 0,
      errors,
    };
  }
}
