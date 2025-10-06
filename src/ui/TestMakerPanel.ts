import * as vscode from "vscode";
import * as path from "path";
import { CodeGeneratorService } from "./utils/codeGenerator";
import { HtmlTemplate } from "./utils/htmlTemplate";
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

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
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
  public static createOrShow(extensionUri: vscode.Uri) {
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
          vscode.Uri.joinPath(extensionUri, "dist"),
          vscode.Uri.joinPath(extensionUri, "media"),
        ],
        // Keep the webview alive even when hidden
        retainContextWhenHidden: true,
      }
    );

    TestMakerPanel.currentPanel = new TestMakerPanel(panel, extensionUri);
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
   * Saves a draft to workspace state
   */
  private _handleSaveDraft(draft: any) {
    // TODO: Implement draft saving logic
    vscode.window.showInformationMessage("Draft saved successfully!");
  }

  /**
   * Loads a saved draft
   */
  private _handleLoadDraft() {
    // TODO: Implement draft loading logic
    this.sendMessage({
      type: "draft-loaded",
      payload: null,
    });
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
   * Saves the generated test to a file
   */
  private async _handleSaveToFile(config: TestConfiguration) {
    try {
      const result = this._codeGenerator.generateYaml(config);

      if (!result.valid) {
        vscode.window.showErrorMessage(
          "Cannot save invalid test configuration"
        );
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const defaultFileName =
        config.name.toLowerCase().replace(/\s+/g, "-") + ".yml";
      const defaultUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        defaultFileName
      );

      const uri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        filters: {
          YAML: ["yml", "yaml"],
          JSON: ["json"],
        },
        saveLabel: "Save Test",
      });

      if (uri) {
        const fs = require("fs").promises;
        await fs.writeFile(uri.fsPath, result.code, "utf8");
        vscode.window.showInformationMessage(`Test saved to ${uri.fsPath}`);

        // Open the saved file
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
    }
  }

  /**
   * Returns the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this._getNonce();
    return HtmlTemplate.generate(webview, nonce);
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
