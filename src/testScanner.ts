import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { FlowTestSuite } from './models/types';

export class TestScanner {
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  private watcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }

    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{yml,yaml}');
    this.watcher.onDidCreate(() => this.refresh());
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidDelete(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async findTestFiles(): Promise<FlowTestSuite[]> {
    const suites: FlowTestSuite[] = [];

    if (!vscode.workspace.workspaceFolders) {
      return suites;
    }

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '**/*.{yml,yaml}'),
        '**/node_modules/**'
      );

      for (const file of files) {
        try {
          const content = fs.readFileSync(file.fsPath, 'utf8');
          const parsed = yaml.parse(content);

          if (this.isFlowTestFile(parsed)) {
            const suite: FlowTestSuite = {
              name: path.basename(file.fsPath, path.extname(file.fsPath)),
              filePath: file.fsPath,
              suite_name: parsed.suite_name || path.basename(file.fsPath),
              base_url: parsed.base_url,
              auth: parsed.auth,
              steps: parsed.steps || []
            };
            suites.push(suite);
          }
        } catch (error) {
          console.warn(`Failed to parse ${file.fsPath}:`, error);
        }
      }
    }

    return suites;
  }

  private isFlowTestFile(parsed: any): boolean {
    return parsed &&
           (parsed.suite_name || parsed.steps) &&
           Array.isArray(parsed.steps) &&
           parsed.steps.length > 0 &&
           parsed.steps.every((step: any) =>
             step.name &&
             step.request &&
             step.request.method &&
             step.request.url
           );
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }
  }
}