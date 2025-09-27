import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { FlowTestSuite } from './models/types';

interface CachedSuite {
  mtimeMs: number;
  suite: FlowTestSuite;
}

export class TestScanner {
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  private watcher: vscode.FileSystemWatcher | undefined;
  private readonly suiteCache: Map<string, CachedSuite> = new Map();

  constructor() {
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }

    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.{yml,yaml}');
    this.watcher.onDidCreate(uri => this.handleFileEvent(uri.fsPath));
    this.watcher.onDidChange(uri => this.handleFileEvent(uri.fsPath));
    this.watcher.onDidDelete(uri => this.handleFileEvent(uri.fsPath));
  }

  refresh(filePath?: string): void {
    this.invalidateCache(filePath);
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
        const suite = await this.loadSuite(file.fsPath);
        if (suite) {
          suites.push(suite);
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

  private async loadSuite(filePath: string): Promise<FlowTestSuite | null> {
    const normalizedPath = this.normalizePath(filePath);

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(normalizedPath);
    } catch {
      this.suiteCache.delete(normalizedPath);
      return null;
    }

    const cached = this.suiteCache.get(normalizedPath);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return cached.suite;
    }

    try {
      const content = await fs.promises.readFile(normalizedPath, 'utf8');
      const parsed = yaml.parse(content);

      if (!this.isFlowTestFile(parsed)) {
        this.suiteCache.delete(normalizedPath);
        return null;
      }

      const suite: FlowTestSuite = {
        name: path.basename(normalizedPath, path.extname(normalizedPath)),
        filePath: normalizedPath,
        suite_name: parsed.suite_name || path.basename(normalizedPath),
        base_url: parsed.base_url,
        auth: parsed.auth,
        steps: parsed.steps || []
      };

      this.suiteCache.set(normalizedPath, {
        mtimeMs: stats.mtimeMs,
        suite
      });

      return suite;
    } catch (error) {
      this.suiteCache.delete(normalizedPath);
      console.warn(`Failed to parse ${normalizedPath}:`, error);
      return null;
    }
  }

  private handleFileEvent(filePath: string): void {
    this.invalidateCache(filePath);
    this._onDidChangeTreeData.fire();
  }

  private invalidateCache(filePath?: string): void {
    if (!filePath) {
      this.suiteCache.clear();
      return;
    }

    const normalizedPath = this.normalizePath(filePath);
    this.suiteCache.delete(normalizedPath);
  }

  private normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }
  }
}
