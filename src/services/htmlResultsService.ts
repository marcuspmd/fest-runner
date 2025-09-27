import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class HtmlResultsService {
  private static instance: HtmlResultsService;
  private webviewPanel: vscode.WebviewPanel | undefined;

  private constructor() {}

  static getInstance(): HtmlResultsService {
    if (!HtmlResultsService.instance) {
      HtmlResultsService.instance = new HtmlResultsService();
    }
    return HtmlResultsService.instance;
  }

  async showResults(workspacePath: string, suiteName?: string): Promise<void> {
    try {
      const htmlResultsPath = await this.findHtmlResults(workspacePath, suiteName);
      if (!htmlResultsPath) {
        vscode.window.showWarningMessage('No HTML test results found. Make sure to run tests with HTML output enabled.');
        return;
      }

      await this.displayHtmlResults(htmlResultsPath, suiteName || 'Test Results');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to show test results: ${errorMessage}`);
    }
  }

  private async findHtmlResults(workspacePath: string, suiteName?: string): Promise<string | null> {
    const possiblePaths = [
      path.join(workspacePath, 'test-results.html'),
      path.join(workspacePath, 'flow-test-results.html'),
      path.join(workspacePath, 'results', 'index.html'),
      path.join(workspacePath, '.fest-runner', 'results.html'),
      path.join(workspacePath, '.fest-runner', 'test-results.html')
    ];

    if (suiteName) {
      possiblePaths.unshift(
        path.join(workspacePath, `${suiteName}-results.html`),
        path.join(workspacePath, 'results', `${suiteName}.html`)
      );
    }

    for (const htmlPath of possiblePaths) {
      try {
        await fs.promises.access(htmlPath, fs.constants.F_OK);
        return htmlPath;
      } catch {
        continue;
      }
    }

    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspacePath, '**/*.html'),
      '**/node_modules/**'
    );

    for (const file of files) {
      const content = await fs.promises.readFile(file.fsPath, 'utf8');
      if (this.isTestResultsHtml(content)) {
        return file.fsPath;
      }
    }

    return null;
  }

  private isTestResultsHtml(content: string): boolean {
    const testResultsIndicators = [
      'flow-test',
      'test-results',
      'suite_name',
      'test-suite',
      'passed',
      'failed',
      'duration'
    ];

    const lowerContent = content.toLowerCase();
    return testResultsIndicators.some(indicator => lowerContent.includes(indicator));
  }

  private async displayHtmlResults(htmlPath: string, title: string): Promise<void> {
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
    }

    this.webviewPanel = vscode.window.createWebviewPanel(
      'flowTestResults',
      `Flow Test Results - ${title}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.dirname(htmlPath)),
          vscode.Uri.file(path.join(path.dirname(htmlPath), '..')),
        ]
      }
    );

    try {
      let htmlContent = await fs.promises.readFile(htmlPath, 'utf8');

      htmlContent = this.processHtmlContent(htmlContent, htmlPath);

      this.webviewPanel.webview.html = htmlContent;

      this.webviewPanel.onDidDispose(() => {
        this.webviewPanel = undefined;
      });

      this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case 'refresh':
            await this.displayHtmlResults(htmlPath, title);
            break;
          case 'openFile':
            if (message.path) {
              const uri = vscode.Uri.file(message.path);
              await vscode.window.showTextDocument(uri);
            }
            break;
        }
      });

    } catch (error) {
      this.webviewPanel.webview.html = this.getErrorHtml(error instanceof Error ? error.message : String(error));
    }
  }

  private processHtmlContent(htmlContent: string, htmlPath: string): string {
    const webview = this.webviewPanel!.webview;
    const htmlDir = path.dirname(htmlPath);

    htmlContent = htmlContent.replace(
      /<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, href) => {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, href);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(href, resourceUri.toString());
      }
    );

    htmlContent = htmlContent.replace(
      /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        if (src.startsWith('http://') || src.startsWith('https://')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, src);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(src, resourceUri.toString());
      }
    );

    htmlContent = htmlContent.replace(
      /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, src);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(src, resourceUri.toString());
      }
    );

    const refreshButton = `
      <div style="position: fixed; top: 10px; right: 10px; z-index: 1000;">
        <button onclick="refreshResults()" style="
          background: #007acc;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        ">
          🔄 Refresh
        </button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        function refreshResults() {
          vscode.postMessage({ command: 'refresh' });
        }

        document.addEventListener('click', (event) => {
          const target = event.target;
          if (target.tagName === 'A' && target.href && target.href.startsWith('file://')) {
            event.preventDefault();
            vscode.postMessage({
              command: 'openFile',
              path: target.href.replace('file://', '')
            });
          }
        });
      </script>
    `;

    if (htmlContent.includes('</body>')) {
      htmlContent = htmlContent.replace('</body>', `${refreshButton}</body>`);
    } else {
      htmlContent += refreshButton;
    }

    return htmlContent;
  }

  private getErrorHtml(errorMessage: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Flow Test Results - Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 16px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .error-title {
            font-weight: bold;
            color: var(--vscode-errorForeground);
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        <h1>Failed to Load Test Results</h1>
        <div class="error">
          <div class="error-title">Error:</div>
          <div>${errorMessage}</div>
        </div>
        <p>Make sure test execution completed successfully and HTML output was generated.</p>
      </body>
      </html>
    `;
  }

  dispose(): void {
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
      this.webviewPanel = undefined;
    }
  }
}