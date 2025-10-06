/**
 * HTML template builder for the Test Maker WebView
 */
export class HtmlTemplate {
  /**
   * Generates the complete HTML for the Test Maker interface
   */
  public static generate(webview: any, nonce: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
        webview.cspSource
      } 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <title>Flow Test Maker</title>
      ${this.getStyles()}
    </head>
    <body>
      <div class="container">
        <header class="header">
          <h1>🧪 Flow Test Maker</h1>
          <p class="subtitle">Create comprehensive tests with an intuitive visual interface</p>
        </header>

        <div class="main-content">
          <!-- Test Configuration Section -->
          <section class="section">
            <h2>📋 Test Configuration</h2>

            <div class="form-grid">
              <div class="form-group">
                <label for="nodeId">Node ID *</label>
                <input type="text" id="nodeId" placeholder="unique-node-id" required />
                <small class="hint">Required: Unique identifier for this test node in the system</small>
              </div>

              <div class="form-group">
                <label for="testName">Test Name *</label>
                <input type="text" id="testName" placeholder="My API Test" required />
              </div>

              <div class="form-group">
                <label for="testType">Test Type</label>
                <select id="testType">
                  <option value="api">API Test</option>
                  <option value="unit">Unit Test</option>
                  <option value="integration">Integration Test</option>
                  <option value="e2e">E2E Test</option>
                </select>
              </div>

              <div class="form-group">
                <label for="baseUrl">Base URL</label>
                <input type="text" id="baseUrl" placeholder="https://api.example.com" />
                <small class="hint">Optional: Set a base URL for all steps</small>
              </div>

              <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" rows="2" placeholder="Describe what this test does..."></textarea>
              </div>
            </div>

            <div class="form-group">
              <label>Global Headers</label>
              <div id="globalHeaders" class="key-value-container">
                <div class="key-value-row">
                  <input type="text" placeholder="Header name" class="key-input" />
                  <input type="text" placeholder="Header value" class="value-input" />
                  <button class="btn-icon btn-remove-row">×</button>
                </div>
              </div>
              <button id="btn-add-global-header" class="btn-secondary btn-sm">+ Add Header</button>
            </div>
          </section>

          <!-- Steps Section -->
          <section class="section">
            <div class="section-header">
              <h2>🔄 Test Steps</h2>
              <button id="btn-add-step" class="btn-primary">+ Add Step</button>
            </div>

            <div id="steps-container" class="steps-container">
              <!-- Steps will be dynamically added here -->
            </div>
          </section>

          <!-- Actions Section -->
          <section class="actions-section">
            <button id="btn-generate-test" class="btn-primary btn-lg">
              <span>⚡</span> Generate Test
            </button>
            <button id="btn-save-draft" class="btn-secondary btn-lg">
              <span>💾</span> Save Draft
            </button>
            <button id="btn-load-draft" class="btn-secondary btn-lg">
              <span>📂</span> Load Draft
            </button>
          </section>

          <!-- Output Section -->
          <section id="outputSection" class="section output-section" style="display: none;">
            <div class="section-header">
              <h2>📝 Generated Test</h2>
              <div class="button-group">
                <button id="btn-copy-clipboard" class="btn-secondary btn-sm">
                  <span>📋</span> Copy
                </button>
                <button id="btn-save-file" class="btn-secondary btn-sm">
                  <span>💾</span> Save to File
                </button>
              </div>
            </div>
            <pre id="output" class="code-output"></pre>
          </section>
        </div>
      </div>

      ${this.getScript(nonce)}
    </body>
    </html>`;
  }

  private static getStyles(): string {
    return `<style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        padding: 20px;
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size, 13px);
        line-height: 1.6;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
      }

      .header {
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .header h1 {
        color: var(--vscode-editor-foreground);
        font-size: 28px;
        margin-bottom: 8px;
      }

      .subtitle {
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
      }

      .section {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        padding: 24px;
        margin-bottom: 20px;
      }

      .section h2 {
        font-size: 18px;
        margin-bottom: 16px;
        color: var(--vscode-editor-foreground);
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 600;
        font-size: 13px;
        color: var(--vscode-foreground);
      }

      .form-group input,
      .form-group select,
      .form-group textarea {
        width: 100%;
        padding: 8px 12px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-family: inherit;
        font-size: 13px;
        transition: border-color 0.2s;
      }

      .form-group input:focus,
      .form-group select:focus,
      .form-group textarea:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
      }

      .form-group textarea {
        resize: vertical;
        min-height: 60px;
      }

      .hint {
        display: block;
        margin-top: 4px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }

      .key-value-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
      }

      .key-value-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 8px;
        align-items: center;
      }

      .key-input,
      .value-input {
        padding: 6px 10px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-size: 12px;
      }

      button {
        padding: 8px 16px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        transition: background-color 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }

      button:active {
        transform: translateY(1px);
      }

      .btn-primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .btn-secondary {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }

      .btn-secondary:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }

      .btn-sm {
        padding: 6px 12px;
        font-size: 12px;
      }

      .btn-lg {
        padding: 12px 24px;
        font-size: 14px;
      }

      .btn-icon {
        width: 28px;
        height: 28px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        font-size: 20px;
        line-height: 1;
      }

      .button-group {
        display: flex;
        gap: 8px;
      }

      .steps-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .step {
        background-color: var(--vscode-sideBar-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        padding: 20px;
        position: relative;
      }

      .step-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .step-header h3 {
        font-size: 16px;
        color: var(--vscode-editor-foreground);
      }

      .step-actions {
        display: flex;
        gap: 8px;
      }

      .actions-section {
        display: flex;
        justify-content: center;
        gap: 16px;
        padding: 24px;
        background-color: var(--vscode-editor-background);
        border-radius: 6px;
        margin-bottom: 20px;
      }

      .output-section pre {
        background-color: var(--vscode-textCodeBlock-background);
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.5;
        color: var(--vscode-editor-foreground);
        max-height: 500px;
        overflow-y: auto;
      }

      .collapsible {
        margin-top: 12px;
      }

      .collapsible-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .collapsible-header:hover {
        background-color: var(--vscode-list-hoverBackground);
      }

      .collapsible-header .icon {
        transition: transform 0.2s;
      }

      .collapsible-header.active .icon {
        transform: rotate(90deg);
      }

      .collapsible-content {
        display: none;
        padding: 16px;
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-top: none;
        border-radius: 0 0 4px 4px;
      }

      .collapsible-content.show {
        display: block;
      }

      .tab-container {
        border-bottom: 1px solid var(--vscode-panel-border);
        margin-bottom: 16px;
      }

      .tab-buttons {
        display: flex;
        gap: 4px;
      }

      .tab-button {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
        transition: all 0.2s;
      }

      .tab-button:hover {
        background-color: var(--vscode-list-hoverBackground);
      }

      .tab-button.active {
        border-bottom-color: var(--vscode-focusBorder);
        color: var(--vscode-focusBorder);
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .step {
        animation: slideIn 0.3s ease-out;
      }

      .error-message {
        color: var(--vscode-errorForeground);
        background-color: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        padding: 8px 12px;
        border-radius: 4px;
        margin-top: 8px;
        font-size: 12px;
      }

      .success-message {
        color: var(--vscode-terminal-ansiGreen);
        background-color: var(--vscode-inputValidation-infoBackground);
        border: 1px solid var(--vscode-inputValidation-infoBorder);
        padding: 8px 12px;
        border-radius: 4px;
        margin-top: 8px;
        font-size: 12px;
      }
    </style>`;
  }

  private static getScript(nonce: string): string {
    return `<script nonce="${nonce}">
      ${this.getJavaScript()}
    </script>`;
  }

  private static getJavaScript(): string {
    return `
      const vscode = acquireVsCodeApi();
      let stepCounter = 0;
      let steps = [];

      // Initialize with one step
      window.addEventListener('DOMContentLoaded', () => {
        addStep();
      });

      window.generateId = function() {
        return 'step_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      };

      window.addStep = function() {
        stepCounter++;
        const stepId = window.generateId();
        const container = document.getElementById('steps-container');
        if (!container) return;

        const stepData = {
          id: stepId,
          name: \`Step \${stepCounter}\`,
          type: 'request',
          method: 'GET',
          asserts: [],
          captures: []
        };

        steps.push(stepData);

        const stepDiv = document.createElement('div');
        stepDiv.className = 'step';
        stepDiv.id = stepId;
        stepDiv.innerHTML = \`
          <div class="step-header">
            <h3>Step \${stepCounter}</h3>
            <div class="step-actions">
              <button class="btn-duplicate-step btn-secondary btn-sm" data-step-id="\${stepId}">Duplicate</button>
              <button class="btn-remove-step btn-icon" data-step-id="\${stepId}" title="Remove step">×</button>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>Step Name *</label>
              <input type="text" class="step-name" data-step-id="\${stepId}" data-field="name" value="Step \${stepCounter}" placeholder="Step name" />
            </div>

            <div class="form-group">
              <label>Step ID (Optional)</label>
              <input type="text" class="step-step-id" data-step-id="\${stepId}" data-field="step_id" placeholder="step-reference-id" />
              <small class="hint">Optional: ID for referencing this step from other steps</small>
            </div>

            <div class="form-group">
              <label>Step Type</label>
              <select class="step-type" data-step-id="\${stepId}" data-field="type">
                <option value="request">HTTP Request</option>
                <option value="input">Input Variables</option>
                <option value="call">Call Function/API</option>
                <option value="scenario">Scenario Reference</option>
              </select>
            </div>
          </div>

          <!-- Request Configuration (shown for type: request) -->
          <div class="step-config step-config-request" data-step-id="\${stepId}">
            <div class="form-grid">
              <div class="form-group">
                <label>HTTP Method</label>
                <select class="step-method" data-step-id="\${stepId}" data-field="method">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div class="form-group" style="grid-column: 1 / -1;">
                <label>URL Path *</label>
                <input type="text" class="step-url" data-step-id="\${stepId}" data-field="url" placeholder="/api/endpoint" />
                <small class="hint">Relative to base URL or absolute URL</small>
              </div>
            </div>
          </div>

          <!-- Input Configuration (shown for type: input) -->
          <div class="step-config step-config-input" data-step-id="\${stepId}" style="display: none;">
            <div class="form-group">
              <label>Input Variables</label>
              <div class="key-value-container" data-step="\${stepId}" data-type="input">
                <div class="key-value-row">
                  <input type="text" placeholder="Variable name" class="key-input" />
                  <input type="text" placeholder="Variable value" class="value-input" />
                  <button class="btn-icon btn-remove-row">×</button>
                </div>
              </div>
              <button class="btn-add-kv btn-secondary btn-sm" data-step-id="\${stepId}" data-type="input">+ Add Input</button>
            </div>
          </div>

          <!-- Call Configuration (shown for type: call) -->
          <div class="step-config step-config-call" data-step-id="\${stepId}" style="display: none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Call Type</label>
                <select class="step-call-type" data-step-id="\${stepId}" data-field="call.type">
                  <option value="function">Function</option>
                  <option value="api">API</option>
                  <option value="step">Step Reference</option>
                </select>
              </div>

              <div class="form-group">
                <label>Target *</label>
                <input type="text" class="step-call-target" data-step-id="\${stepId}" data-field="call.target" placeholder="function-name or step-id" />
                <small class="hint">Function name, API endpoint, or step ID to call</small>
              </div>
            </div>
          </div>

          <!-- Scenario Configuration (shown for type: scenario) -->
          <div class="step-config step-config-scenario" data-step-id="\${stepId}" style="display: none;">
            <div class="form-group">
              <label>Scenario Name *</label>
              <input type="text" class="step-scenario-name" data-step-id="\${stepId}" data-field="scenario" placeholder="scenario-name" />
              <small class="hint">Reference to a scenario defined in the test</small>
            </div>
          </div>

          <!-- Tabs for advanced options -->
          <div class="tab-container">
            <div class="tab-buttons">
              <button class="tab-button active" data-tab-id="headers-\${stepId}">Headers</button>
              <button class="tab-button" data-tab-id="body-\${stepId}">Body</button>
              <button class="tab-button" data-tab-id="asserts-\${stepId}">Asserts</button>
              <button class="tab-button" data-tab-id="captures-\${stepId}">Captures</button>
              <button class="tab-button" data-tab-id="advanced-\${stepId}">Advanced</button>
            </div>
          </div>

          <!-- Headers Tab -->
          <div id="headers-\${stepId}" class="tab-content active">
            <div class="form-group">
              <label>Request Headers</label>
              <div class="key-value-container" data-step="\${stepId}" data-type="headers">
                <div class="key-value-row">
                  <input type="text" placeholder="Header name" class="key-input" />
                  <input type="text" placeholder="Header value" class="value-input" />
                  <button class="btn-icon btn-remove-row">×</button>
                </div>
              </div>
              <button class="btn-add-kv btn-secondary btn-sm" data-step-id="\${stepId}" data-type="headers">+ Add Header</button>
            </div>
          </div>

          <!-- Body Tab -->
          <div id="body-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Request Body (JSON)</label>
              <textarea class="step-body" data-step-id="\${stepId}" data-field="body" rows="6" placeholder='{\n  "key": "value"\n}'></textarea>
            </div>
          </div>

          <!-- Asserts Tab -->
          <div id="asserts-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Assertions</label>
              <div id="asserts-container-\${stepId}" class="asserts-container">
                <!-- Asserts will be added here -->
              </div>
              <button class="btn-add-assert btn-secondary btn-sm" data-step-id="\${stepId}">+ Add Assert</button>
            </div>
          </div>

          <!-- Captures Tab -->
          <div id="captures-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Captures (Extract Variables)</label>
              <div id="captures-container-\${stepId}" class="captures-container">
                <!-- Captures will be added here -->
              </div>
              <button class="btn-add-capture btn-secondary btn-sm" data-step-id="\${stepId}">+ Add Capture</button>
            </div>
          </div>

          <!-- Advanced Tab -->
          <div id="advanced-\${stepId}" class="tab-content">
            <div class="form-grid">
              <div class="form-group">
                <label>Timeout (ms)</label>
                <input type="number" class="step-timeout" data-step-id="\${stepId}" data-field="timeout" placeholder="5000" />
              </div>
              <div class="form-group">
                <label>Retries</label>
                <input type="number" class="step-retries" data-step-id="\${stepId}" data-field="retries" placeholder="0" />
              </div>
            </div>
          </div>
        \`;

        container.appendChild(stepDiv);

        // Attach event listeners for this step
        attachStepEventListeners(stepDiv, stepId);
      };

      window.switchTab = function(button, tabId) {
              <small class="hint">Relative to base URL or absolute URL</small>
            </div>
          </div>

          <!-- Tabs for advanced options -->
          <div class="tab-container">
            <div class="tab-buttons">
              <button class="tab-button active" data-tab-id="headers-\${stepId}">Headers</button>
              <button class="tab-button" data-tab-id="body-\${stepId}">Body</button>
              <button class="tab-button" data-tab-id="asserts-\${stepId}">Asserts</button>
              <button class="tab-button" data-tab-id="captures-\${stepId}">Captures</button>
              <button class="tab-button" data-tab-id="advanced-\${stepId}">Advanced</button>
            </div>
          </div>

          <!-- Headers Tab -->
          <div id="headers-\${stepId}" class="tab-content active">
            <div class="form-group">
              <label>Request Headers</label>
              <div class="key-value-container" data-step="\${stepId}" data-type="headers">
                <div class="key-value-row">
                  <input type="text" placeholder="Header name" class="key-input" />
                  <input type="text" placeholder="Header value" class="value-input" />
                  <button class="btn-icon btn-remove-row">×</button>
                </div>
              </div>
              <button class="btn-add-kv btn-secondary btn-sm" data-step-id="\${stepId}" data-type="headers">+ Add Header</button>
            </div>
          </div>

          <!-- Body Tab -->
          <div id="body-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Request Body (JSON)</label>
              <textarea class="step-body" data-step-id="\${stepId}" data-field="body" rows="6" placeholder='{\n  "key": "value"\n}'></textarea>
            </div>
          </div>

          <!-- Asserts Tab -->
          <div id="asserts-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Assertions</label>
              <div id="asserts-container-\${stepId}" class="asserts-container">
                <!-- Asserts will be added here -->
              </div>
              <button class="btn-add-assert btn-secondary btn-sm" data-step-id="\${stepId}">+ Add Assert</button>
            </div>
          </div>

          <!-- Captures Tab -->
          <div id="captures-\${stepId}" class="tab-content">
            <div class="form-group">
              <label>Captures (Extract Variables)</label>
              <div id="captures-container-\${stepId}" class="captures-container">
                <!-- Captures will be added here -->
              </div>
              <button class="btn-add-capture btn-secondary btn-sm" data-step-id="\${stepId}">+ Add Capture</button>
            </div>
          </div>

          <!-- Advanced Tab -->
          <div id="advanced-\${stepId}" class="tab-content">
            <div class="form-grid">
              <div class="form-group">
                <label>Timeout (ms)</label>
                <input type="number" class="step-timeout" data-step-id="\${stepId}" data-field="timeout" placeholder="5000" />
              </div>
              <div class="form-group">
                <label>Retries</label>
                <input type="number" class="step-retries" data-step-id="\${stepId}" data-field="retries" placeholder="0" />
              </div>
            </div>
          </div>
        \`;

        container.appendChild(stepDiv);

        // Attach event listeners for this step
        attachStepEventListeners(stepDiv, stepId);
      };

      window.switchTab = function(button, tabId) {
        const stepDiv = button.closest('.step');
        if (!stepDiv) return;

        const allButtons = stepDiv.querySelectorAll('.tab-button');
        const allTabs = stepDiv.querySelectorAll('.tab-content');

        allButtons.forEach(btn => btn.classList.remove('active'));
        allTabs.forEach(tab => tab.classList.remove('active'));

        button.classList.add('active');
        const tabElement = document.getElementById(tabId);
        if (tabElement) {
          tabElement.classList.add('active');
        }
      };

      window.updateStepData = function(stepId, field, value) {
        const step = steps.find(s => s.id === stepId);
        if (step) {
          step[field] = value;
        }
      };

      window.addKeyValueRow = function(stepId, type) {
        const container = document.querySelector(\`[data-step="\${stepId}"][data-type="\${type}"]\`);
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'key-value-row';
        row.innerHTML = \`
          <input type="text" placeholder="Key" class="key-input" />
          <input type="text" placeholder="Value" class="value-input" />
          <button class="btn-icon btn-remove-row">×</button>
        \`;
        container.appendChild(row);
      };

      window.removeRow = function(button) {
        const row = button.closest('.key-value-row');
        if (!row) return;

        const container = row.parentElement;
        if (container && container.children.length > 1) {
          row.remove();
        }
      };

      window.addGlobalHeader = function() {
        const container = document.getElementById('globalHeaders');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'key-value-row';
        row.innerHTML = \`
          <input type="text" placeholder="Header name" class="key-input" />
          <input type="text" placeholder="Header value" class="value-input" />
          <button class="btn-icon btn-remove-row">×</button>
        \`;
        container.appendChild(row);
      };

      window.addAssert = function(stepId) {
        const container = document.getElementById(\`asserts-container-\${stepId}\`);
        if (!container) return;

        const assertId = window.generateId();

        const assertDiv = document.createElement('div');
        assertDiv.className = 'key-value-row';
        assertDiv.innerHTML = \`
          <select class="key-input">
            <option value="equals">Equals</option>
            <option value="notEquals">Not Equals</option>
            <option value="contains">Contains</option>
            <option value="exists">Exists</option>
            <option value="statusCode">Status Code</option>
          </select>
          <input type="text" placeholder="JSON path (e.g., $.data.id)" class="value-input" />
          <input type="text" placeholder="Expected value" class="value-input" />
          <button class="btn-icon btn-remove-row">×</button>
        \`;
        container.appendChild(assertDiv);
      };

      window.addCapture = function(stepId) {
        const container = document.getElementById(\`captures-container-\${stepId}\`);
        if (!container) return;

        const captureId = window.generateId();

        const captureDiv = document.createElement('div');
        captureDiv.className = 'key-value-row';
        captureDiv.innerHTML = \`
          <input type="text" placeholder="Variable name" class="key-input" />
          <input type="text" placeholder="JSON path (e.g., $.data.token)" class="value-input" />
          <button class="btn-icon btn-remove-row">×</button>
        \`;
        container.appendChild(captureDiv);
      };

      window.removeStep = function(stepId) {
        const stepDiv = document.getElementById(stepId);
        if (stepDiv && steps.length > 1) {
          stepDiv.remove();
          steps = steps.filter(s => s.id !== stepId);
        } else if (steps.length === 1) {
          vscode.postMessage({
            type: 'error',
            payload: 'Cannot remove the last step. At least one step is required.'
          });
        }
      };

      window.duplicateStep = function(stepId) {
        const step = steps.find(s => s.id === stepId);
        if (step) {
          // TODO: Implement step duplication
          window.addStep();
        }
      };

      window.collectFormData = function() {
        const testName = document.getElementById('testName').value;
        const testType = document.getElementById('testType').value;
        const baseUrl = document.getElementById('baseUrl').value;
        const nodeId = document.getElementById('nodeId').value;
        const description = document.getElementById('description').value;

        // Collect global headers
        const globalHeaders = {};
        document.querySelectorAll('#globalHeaders .key-value-row').forEach(row => {
          const key = row.querySelector('.key-input').value.trim();
          const value = row.querySelector('.value-input').value.trim();
          if (key && value) {
            globalHeaders[key] = value;
          }
        });

        // Collect steps data
        const stepsData = [];
        steps.forEach(step => {
          const stepDiv = document.getElementById(step.id);
          if (!stepDiv) return;

          // Get step type and step_id
          const stepType = stepDiv.querySelector('.step-type')?.value || 'request';
          const stepIdInput = stepDiv.querySelector('.step-id')?.value.trim();

          // Base step data
          const stepData = {
            id: step.id,
            name: stepDiv.querySelector('.step-name').value,
            type: stepType
          };

          // Add step_id if provided
          if (stepIdInput) {
            stepData.step_id = stepIdInput;
          }

          // Collect data based on step type
          if (stepType === 'request') {
            // Request type: collect HTTP request data
            stepData.url = stepDiv.querySelector('.step-url').value;
            stepData.method = stepDiv.querySelector('.step-method').value;
            stepData.headers = {};
            stepData.asserts = [];
            stepData.captures = [];

            // Collect step headers
            stepDiv.querySelectorAll(\`[data-step="\${step.id}"][data-type="headers"] .key-value-row\`).forEach(row => {
              const key = row.querySelector('.key-input').value.trim();
              const value = row.querySelector('.value-input').value.trim();
              if (key && value) {
                stepData.headers[key] = value;
              }
            });

            // Collect body
            const bodyTextarea = stepDiv.querySelector('.step-body');
            if (bodyTextarea && bodyTextarea.value.trim()) {
              try {
                stepData.body = JSON.parse(bodyTextarea.value);
              } catch (e) {
                stepData.body = bodyTextarea.value;
              }
            }

            // Collect asserts
            const assertsContainer = stepDiv.querySelector(\`#asserts-container-\${step.id}\`);
            if (assertsContainer) {
              assertsContainer.querySelectorAll('.key-value-row').forEach(row => {
                const inputs = row.querySelectorAll('input, select');
                if (inputs.length >= 2) {
                  stepData.asserts.push({
                    id: generateId(),
                    type: inputs[0].value,
                    path: inputs[1].value,
                    expected: inputs[2] ? inputs[2].value : undefined
                  });
                }
              });
            }

            // Collect captures
            const capturesContainer = stepDiv.querySelector(\`#captures-container-\${step.id}\`);
            if (capturesContainer) {
              capturesContainer.querySelectorAll('.key-value-row').forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 2 && inputs[0].value && inputs[1].value) {
                  stepData.captures.push({
                    id: generateId(),
                    name: inputs[0].value,
                    path: inputs[1].value,
                    type: 'json'
                  });
                }
              });
            }

            // Collect timeout and retries
            const timeout = stepDiv.querySelector('.step-timeout')?.value;
            const retries = stepDiv.querySelector('.step-retries')?.value;
            if (timeout) stepData.timeout = parseInt(timeout);
            if (retries) stepData.retries = parseInt(retries);

          } else if (stepType === 'input') {
            // Input type: collect input variables
            stepData.input = {};
            const inputContainer = stepDiv.querySelector('.step-config-input');
            if (inputContainer) {
              inputContainer.querySelectorAll('.key-value-row').forEach(row => {
                const key = row.querySelector('.key-input').value.trim();
                const value = row.querySelector('.value-input').value.trim();
                if (key) {
                  stepData.input[key] = value;
                }
              });
            }

          } else if (stepType === 'call') {
            // Call type: collect call configuration
            const callTypeSelect = stepDiv.querySelector('.call-type');
            const callTargetInput = stepDiv.querySelector('.call-target');
            
            stepData.call = {
              type: callTypeSelect?.value || 'function',
              target: callTargetInput?.value.trim() || ''
            };

          } else if (stepType === 'scenario') {
            // Scenario type: collect scenario reference
            const scenarioInput = stepDiv.querySelector('.scenario-name');
            stepData.scenario = scenarioInput?.value.trim() || '';
          }

          stepsData.push(stepData);
        });

        return {
          id: window.generateId(),
          name: testName,
          description: description,
          type: testType,
          node_id: nodeId,
          baseUrl: baseUrl,
          version: '1.0',
          headers: Object.keys(globalHeaders).length > 0 ? globalHeaders : undefined,
          steps: stepsData
        };
      };

      window.generateTest = function() {
        const config = window.collectFormData();

        if (!config.name) {
          vscode.postMessage({
            type: 'error',
            payload: 'Test name is required'
          });
          return;
        }

        if (!config.steps || config.steps.length === 0) {
          vscode.postMessage({
            type: 'error',
            payload: 'At least one step is required'
          });
          return;
        }

        vscode.postMessage({
          type: 'generate-test',
          payload: config
        });
      };

      window.copyToClipboard = function() {
        const output = document.getElementById('output');
        if (!output) return;

        vscode.postMessage({
          type: 'copy-to-clipboard',
          payload: output.textContent
        });
      };

      window.saveToFile = function() {
        const config = window.collectFormData();
        vscode.postMessage({
          type: 'save-to-file',
          payload: config
        });
      };

      window.saveDraft = function() {
        const config = window.collectFormData();
        vscode.postMessage({
          type: 'save-draft',
          payload: config
        });
      };

      window.loadDraft = function() {
        vscode.postMessage({
          type: 'load-draft',
          payload: null
        });
      };

      // Function to attach event listeners to a step
      function attachStepEventListeners(stepDiv, stepId) {
        // Tab switching
        stepDiv.querySelectorAll('.tab-button').forEach(button => {
          button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab-id');
            window.switchTab(this, tabId);
          });
        });

        // Step type change - show/hide relevant config sections
        const stepTypeSelect = stepDiv.querySelector('.step-type');
        if (stepTypeSelect) {
          stepTypeSelect.addEventListener('change', function() {
            const stepId = this.getAttribute('data-step-id');
            const selectedType = this.value;
            
            // Hide all config sections
            stepDiv.querySelectorAll('.step-config').forEach(config => {
              config.style.display = 'none';
            });
            
            // Show the relevant config section
            const activeConfig = stepDiv.querySelector(\`.step-config-\${selectedType}\`);
            if (activeConfig) {
              activeConfig.style.display = 'block';
            }
            
            // Update step data
            window.updateStepData(stepId, 'type', selectedType);
          });
        }

        // Input changes for step data
        const inputs = stepDiv.querySelectorAll('[data-step-id][data-field]');
        inputs.forEach(input => {
          input.addEventListener('change', function() {
            const stepId = this.getAttribute('data-step-id');
            const field = this.getAttribute('data-field');
            window.updateStepData(stepId, field, this.value);
          });
        });

        // Duplicate button
        const duplicateBtn = stepDiv.querySelector('.btn-duplicate-step');
        if (duplicateBtn) {
          duplicateBtn.addEventListener('click', function() {
            const stepId = this.getAttribute('data-step-id');
            window.duplicateStep(stepId);
          });
        }

        // Remove button
        const removeBtn = stepDiv.querySelector('.btn-remove-step');
        if (removeBtn) {
          removeBtn.addEventListener('click', function() {
            const stepId = this.getAttribute('data-step-id');
            window.removeStep(stepId);
          });
        }

        // Add header/assert/capture buttons
        const addKvBtns = stepDiv.querySelectorAll('.btn-add-kv');
        addKvBtns.forEach(btn => {
          btn.addEventListener('click', function() {
            const stepId = this.getAttribute('data-step-id');
            const type = this.getAttribute('data-type');
            window.addKeyValueRow(stepId, type);
          });
        });

        const addAssertBtn = stepDiv.querySelector('.btn-add-assert');
        if (addAssertBtn) {
          addAssertBtn.addEventListener('click', function() {
            const stepId = this.getAttribute('data-step-id');
            window.addAssert(stepId);
          });
        }

        const addCaptureBtn = stepDiv.querySelector('.btn-add-capture');
        if (addCaptureBtn) {
          addCaptureBtn.addEventListener('click', function() {
            const stepId = this.getAttribute('data-step-id');
            window.addCapture(stepId);
          });
        }
      }

      // Initialize event listeners on page load
      document.addEventListener('DOMContentLoaded', function() {
        // Global buttons
        const btnAddStep = document.getElementById('btn-add-step');
        if (btnAddStep) {
          btnAddStep.addEventListener('click', () => window.addStep());
        }

        const btnAddGlobalHeader = document.getElementById('btn-add-global-header');
        if (btnAddGlobalHeader) {
          btnAddGlobalHeader.addEventListener('click', () => window.addGlobalHeader());
        }

        const btnGenerateTest = document.getElementById('btn-generate-test');
        if (btnGenerateTest) {
          btnGenerateTest.addEventListener('click', () => window.generateTest());
        }

        const btnSaveDraft = document.getElementById('btn-save-draft');
        if (btnSaveDraft) {
          btnSaveDraft.addEventListener('click', () => window.saveDraft());
        }

        const btnLoadDraft = document.getElementById('btn-load-draft');
        if (btnLoadDraft) {
          btnLoadDraft.addEventListener('click', () => window.loadDraft());
        }

        const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
        if (btnCopyClipboard) {
          btnCopyClipboard.addEventListener('click', () => window.copyToClipboard());
        }

        const btnSaveFile = document.getElementById('btn-save-file');
        if (btnSaveFile) {
          btnSaveFile.addEventListener('click', () => window.saveToFile());
        }

        // Event delegation for remove buttons (dynamically added)
        document.addEventListener('click', function(e) {
          if (e.target.classList.contains('btn-remove-row')) {
            window.removeRow(e.target);
          }
        });
      });

      // Listen for messages from the extension
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
          case 'test-generated':
            const output = document.getElementById('output');
            const outputSection = document.getElementById('outputSection');

            if (message.payload.success) {
              output.textContent = message.payload.code;
              outputSection.style.display = 'block';
              outputSection.scrollIntoView({ behavior: 'smooth' });
            } else {
              output.textContent = 'Error: ' + (message.payload.error || 'Unknown error');
              outputSection.style.display = 'block';
            }
            break;

          case 'draft-loaded':
            if (message.payload) {
              // TODO: Populate form with loaded draft
              console.log('Draft loaded:', message.payload);
            }
            break;
        }
      });
    `;
  }
}
