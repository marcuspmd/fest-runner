import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { CodeGeneratorService } from "./utils/codeGenerator";
import { TestConfiguration } from "./types";

/**
 * Manages the WebView panel for the Test Maker UI
 */
export class TestMakerPanel {
  public static currentPanel: TestMakerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private readonly _codeGenerator: CodeGeneratorService;
  private _context: vscode.ExtensionContext;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._codeGenerator = new CodeGeneratorService();

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  /**
   * Creates or shows the Test Maker panel
   */
  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (TestMakerPanel.currentPanel) {
      TestMakerPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "flowTestMaker",
      "Flow Test Maker",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,
        // Restrict the webview to only loading content from our extension's directory
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
          vscode.Uri.joinPath(extensionUri, "src", "ui", "webview"), // For development
        ],
        // Keep the webview alive even when hidden
        retainContextWhenHidden: true,
      }
    );

    TestMakerPanel.currentPanel = new TestMakerPanel(panel, extensionUri, context);
  }

  /**
   * Sends a message to the webview
   */
  public sendMessage(message: any) {
    this._panel.webview.postMessage(message);
  }

  /**
   * Disposes of the panel
   */
  public dispose() {
    TestMakerPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Handles messages received from the webview
   */
  private _handleMessage(message: any) {
    switch (message.type) {
      case "generate-test":
        this._handleGenerateTest(message.payload);
        break;
      case "validate-url":
        this._handleValidateUrl(message.payload);
        break;
      case "save-draft":
        this._handleSaveDraft(message.payload);
        break;
      case "load-draft":
        this._handleLoadDraft();
        break;
      case "copy-to-clipboard":
        this._handleCopyToClipboard(message.payload);
        break;
      case "save-to-file":
        this._handleSaveToFile(message.payload);
        break;
      case "load-from-file":
        this._handleLoadFromFile();
        break;
      case "http-request":
        this._handleHttpRequest(message.payload);
        break;
      case "run-test":
        this._handleRunTest(message.payload);
        break;
      case "error":
        vscode.window.showErrorMessage(message.payload);
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Generates a test based on the provided configuration
   */
  private async _handleGenerateTest(config: TestConfiguration) {
    try {
      // Validate configuration
      const validation = this._codeGenerator.validate(config);

      if (!validation.valid) {
        this.sendMessage({
          type: "test-generated",
          payload: {
            success: false,
            errors: validation.errors,
            error: "Validation failed. Please check the errors.",
          },
        });
        return;
      }

      // Generate YAML test
      const result = this._codeGenerator.generateYaml(config);

      if (result.valid) {
        this.sendMessage({
          type: "test-generated",
          payload: {
            code: result.code,
            language: result.language,
            success: true,
          },
        });

        vscode.window.showInformationMessage("Test generated successfully!");
      } else {
        this.sendMessage({
          type: "test-generated",
          payload: {
            success: false,
            errors: result.errors,
            error: "Failed to generate test code",
          },
        });
      }
    } catch (error: any) {
      this.sendMessage({
        type: "test-generated",
        payload: {
          success: false,
          error: error.message,
        },
      });
      vscode.window.showErrorMessage(`Error generating test: ${error.message}`);
    }
  }

  /**
   * Validates a URL
   */
  private _handleValidateUrl(url: string) {
    try {
      new URL(url);
      this.sendMessage({
        type: "url-validated",
        payload: { valid: true },
      });
    } catch {
      this.sendMessage({
        type: "url-validated",
        payload: { valid: false, error: "Invalid URL format" },
      });
    }
  }

  /**
   * Saves a draft to global state
   */
  private async _handleSaveDraft(draft: any) {
    try {
      await this._context.globalState.update('flowTestMaker.draft', draft);
      vscode.window.showInformationMessage("Draft saved successfully!");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save draft: ${error.message}`);
    }
  }

  /**
   * Loads a saved draft from global state
   */
  private async _handleLoadDraft() {
    try {
      const draft = this._context.globalState.get('flowTestMaker.draft');

      if (draft) {
        this.sendMessage({
          type: "draft-loaded",
          payload: draft,
        });
        vscode.window.showInformationMessage("Draft loaded successfully!");
      } else {
        vscode.window.showWarningMessage("No draft found");
        this.sendMessage({
          type: "draft-loaded",
          payload: null,
        });
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load draft: ${error.message}`);
    }
  }

  /**
   * Loads a test from an existing YAML file
   */
  private async _handleLoadFromFile() {
    try {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'YAML': ['yml', 'yaml']
        },
        openLabel: 'Load Test'
      });

      if (!uris || uris.length === 0) {
        return;
      }

      const uri = uris[0];
      const yaml = require('yaml');
      const fs = require('fs').promises;

      const content = await fs.readFile(uri.fsPath, 'utf8');
      const parsed = yaml.parse(content);

      // Convert parsed YAML to our state format
      const state = {
        config: {
          suite_name: parsed.suite_name || parsed.name || '',
          node_id: parsed.node_id || '',
          description: parsed.description || '',
          base_url: parsed.base_url || parsed.baseUrl || '',
          type: parsed.type || 'api',
          version: parsed.version || '1.0',
          headers: parsed.headers || {},
          variables: parsed.variables || {},
          depends: parsed.depends || [],
          exports: parsed.exports || [],
          tags: parsed.tags || []
        },
        steps: parsed.steps || []
      };

      this.sendMessage({
        type: "draft-loaded",
        payload: state,
      });

      vscode.window.showInformationMessage(`Test loaded from ${uri.fsPath}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load file: ${error.message}`);
    }
  }

  /**
   * Copies text to clipboard
   */
  private async _handleCopyToClipboard(text: string) {
    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage("Copied to clipboard!");
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to copy: ${error.message}`);
    }
  }

  /**
   * Runs the test from the webview using --inline-yaml
   */
  private async _handleRunTest(payload: any) {
    try {
      console.log('[TestMakerPanel] Running test with --inline-yaml...');

      const yaml = require('yaml');
      const { spawn } = require('child_process');

      // Ensure node_id is present (required by flow-test-engine)
      if (!payload.node_id) {
        payload.node_id = payload.suite_name || 'test-suite';
      }

      // Serialize state to YAML
      const yamlContent = yaml.stringify(payload);

      console.log('[TestMakerPanel] YAML content length:', yamlContent.length);
      console.log('[TestMakerPanel] node_id:', payload.node_id);

      // Execute the test using flow-test-engine with --inline-yaml
      // The CLI will automatically discover the base directory from flow-test.config.*
      // Pass YAML via stdin to avoid shell interpretation issues
      const command = 'flow-test-engine';
      const args = ['--inline-yaml', '-', '--verbose'];

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      const testProcess = spawn(command, args, {
        cwd: workspaceFolder || process.cwd(),
        shell: false // Don't use shell to avoid interpretation of YAML as commands
      });

      // Write YAML to stdin
      testProcess.stdin.write(yamlContent);
      testProcess.stdin.end();

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      testProcess.on('close', async (code: number) => {
        const success = code === 0;

        // Send toast notification to webview
        this.sendMessage({
          type: 'toast',
          payload: {
            message: success ? '✅ Teste executado com sucesso!' : `❌ Teste falhou com código ${code}`,
            type: success ? 'success' : 'error'
          }
        });

        if (success) {
          vscode.window.showInformationMessage('✅ Teste executado com sucesso!');

          // Show output in a new document
          const doc = await vscode.workspace.openTextDocument({
            content: output,
            language: 'json' // flow-test-engine outputs JSON
          });
          await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        } else {
          vscode.window.showErrorMessage(`❌ Teste falhou com código ${code}`);

          // Show error output
          const doc = await vscode.workspace.openTextDocument({
            content: errorOutput || output,
            language: 'plaintext'
          });
          await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        }
      });

      testProcess.on('error', (error: Error) => {
        console.error('[TestMakerPanel] Test execution error:', error);
        vscode.window.showErrorMessage(`Erro ao executar teste: ${error.message}`);

        this.sendMessage({
          type: 'test-executed',
          payload: {
            success: false,
            error: error.message
          }
        });
      });

    } catch (error: any) {
      console.error('[TestMakerPanel] Run test error:', error);
      vscode.window.showErrorMessage(`Erro ao executar teste: ${error.message}`);

      this.sendMessage({
        type: 'test-executed',
        payload: {
          success: false,
          error: error.message
        }
      });
    }
  }

  /**
   * Handles HTTP requests from the webview (for cURL lab)
   */
  private async _handleHttpRequest(payload: any) {
    const { requestId, url, method, headers, body } = payload;

    try {
      console.log(`[TestMakerPanel] HTTP Request: ${method} ${url}`);
      console.log(`[TestMakerPanel] Headers:`, JSON.stringify(headers, null, 2));
      console.log(`[TestMakerPanel] Body:`, body ? body.substring(0, 100) : 'null');

      // Use fetch API (available in Node.js 18+) or fall back to https module
      const response = await this._makeHttpRequest(url, method, headers, body);

      console.log(`[TestMakerPanel] Response status: ${response.status}`);

      // Send response back to webview
      this.sendMessage({
        type: "http-response",
        payload: {
          requestId,
          success: true,
          data: response
        }
      });
    } catch (error: any) {
      console.error(`[TestMakerPanel] HTTP Request failed:`, error);

      // Send error back to webview
      this.sendMessage({
        type: "http-response",
        payload: {
          requestId,
          success: false,
          error: error.message || "HTTP request failed"
        }
      });
    }
  }

  /**
   * Makes an HTTP request using Node.js
   */
  private async _makeHttpRequest(
    url: string,
    method: string = 'GET',
    headers: any = {},
    body: string | null = null
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? require('https') : require('http');

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'VSCode-Flow-Test-Runner/1.0',
          ...headers
        }
      };

      const req = httpModule.request(options, (res: any) => {
        let responseBody = '';

        res.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString();
        });

        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: responseBody,
            url: url
          });
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      // Set timeout
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      // Send body if present
      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Saves the generated test to a file
   */
  private async _handleSaveToFile(payload: any) {
    try {
      console.log('[TestMakerPanel] Saving file with payload:', JSON.stringify(payload).substring(0, 200));

      // Payload is the state from YamlState.getState()
      // We need to serialize it to YAML
      const yaml = require('yaml');

      // Convert state to YAML format
      const yamlContent = yaml.stringify(payload);

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        this.sendMessage({
          type: "error",
          payload: "No workspace folder found"
        });
        return;
      }

      const defaultFileName =
        (payload.node_id || payload.suite_name || 'test').toLowerCase().replace(/\s+/g, "-") + ".yml";
      const defaultUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        defaultFileName
      );

      const uri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        filters: {
          YAML: ["yml", "yaml"],
        },
        saveLabel: "Save Test",
      });

      if (uri) {
        const fs = require("fs").promises;
        await fs.writeFile(uri.fsPath, yamlContent, "utf8");

        // Send confirmation back to webview
        this.sendMessage({
          type: "file-saved",
          payload: { filename: path.basename(uri.fsPath) }
        });

        vscode.window.showInformationMessage(`Test saved to ${path.basename(uri.fsPath)}`);

        // Open the saved file
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (error: any) {
      console.error('[TestMakerPanel] Save error:', error);
      this.sendMessage({
        type: "error",
        payload: `Failed to save file: ${error.message}`
      });
    }
  }

  /**
   * Returns the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this._getNonce();

    // Try to load from dist first (production), fall back to src (development)
    const possiblePaths = [
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview", "index.html"),
      vscode.Uri.joinPath(this._extensionUri, "src", "ui", "webview", "index.html"),
    ];

    let htmlPath: vscode.Uri | undefined;
    for (const path of possiblePaths) {
      if (fs.existsSync(path.fsPath)) {
        htmlPath = path;
        break;
      }
    }

    if (!htmlPath) {
      return `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Error: Could not find webview HTML file</h1>
          <p>Searched paths:</p>
          <ul>
            ${possiblePaths.map(p => `<li>${p.fsPath}</li>`).join('')}
          </ul>
        </body>
        </html>
      `;
    }

    // Read HTML template
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // Get base directory for resources
    const webviewBaseUri = vscode.Uri.joinPath(
      htmlPath,
      ".." // Go up from index.html to webview directory
    );

    // Generate URIs for all resources
    const stylesMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "styles", "main.css")
    );
    const stylesComponentsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "styles", "components.css")
    );
    const stylesResponsiveUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "styles", "responsive.css")
    );

    const jsYamlUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "vendor", "js-yaml.min.js")
    );

    const stateJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "state.js")
    );
    const validatorJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "validator.js")
    );
    const yamlSerializerJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "yaml-serializer.js")
    );
    const curlLabJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "curl-lab.js")
    );
    const formsJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "forms.js")
    );
    const fileManagerJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "file-manager.js")
    );
    const vscodeBridgeJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "vscode-bridge.js")
    );
    const appJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewBaseUri, "scripts", "app.js")
    );

    // Replace all placeholders in HTML
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
    html = html.replace(/\{\{stylesMainUri\}\}/g, stylesMainUri.toString());
    html = html.replace(/\{\{stylesComponentsUri\}\}/g, stylesComponentsUri.toString());
    html = html.replace(/\{\{stylesResponsiveUri\}\}/g, stylesResponsiveUri.toString());
    html = html.replace(/\{\{jsYamlUri\}\}/g, jsYamlUri.toString());
    html = html.replace(/\{\{stateJsUri\}\}/g, stateJsUri.toString());
    html = html.replace(/\{\{validatorJsUri\}\}/g, validatorJsUri.toString());
    html = html.replace(/\{\{yamlSerializerJsUri\}\}/g, yamlSerializerJsUri.toString());
    html = html.replace(/\{\{curlLabJsUri\}\}/g, curlLabJsUri.toString());
    html = html.replace(/\{\{formsJsUri\}\}/g, formsJsUri.toString());
    html = html.replace(/\{\{fileManagerJsUri\}\}/g, fileManagerJsUri.toString());
    html = html.replace(/\{\{vscodeBridgeJsUri\}\}/g, vscodeBridgeJsUri.toString());
    html = html.replace(/\{\{appJsUri\}\}/g, appJsUri.toString());

    return html;
  }

  private _getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
