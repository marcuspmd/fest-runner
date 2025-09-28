import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { FlowTestConfig, FlowTestSuite } from "./models/types";
import { ConfigService } from "./services/configService";

interface CachedSuite {
  mtimeMs: number;
  suite: FlowTestSuite;
}

export class TestScanner {
  private _onDidChangeTreeData: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this._onDidChangeTreeData.event;

  private watchers: vscode.FileSystemWatcher[] = [];
  private readonly suiteCache: Map<string, CachedSuite> = new Map();
  private readonly configService = ConfigService.getInstance();

  constructor() {
    void this.setupFileWatchers();
  }

  private async setupFileWatchers(): Promise<void> {
    this.disposeWatchers();

    if (!vscode.workspace.workspaceFolders) {
      return;
    }

    const processedDirectories = new Set<string>();
    const watcherKeys = new Set<string>();

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const workspacePath = workspaceFolder.uri.fsPath;
      let config: FlowTestConfig;

      try {
        config = await this.configService.getConfig(workspacePath);
      } catch (error) {
        console.warn(
          `Failed to load Flow Test configuration for ${workspacePath}:`,
          error
        );
        continue;
      }

      const searchDirectories = await this.resolveSearchDirectories(
        config,
        workspacePath,
        processedDirectories
      );

      const patterns = config.discovery?.patterns ?? ["**/*.yml", "**/*.yaml"];
      const normalizedPatterns = patterns
        .map((pattern) => this.normalizeGlobPattern(pattern))
        .filter(Boolean);

      const extraPatterns = [
        "flow-test.config.yml",
        "flow-test.config.yaml",
        "test-config.yml",
        "test-config.yaml",
      ];

      if (normalizedPatterns.length === 0) {
        normalizedPatterns.push("**/*.yml", "**/*.yaml");
      }

      for (const directory of searchDirectories) {
        for (const pattern of normalizedPatterns) {
          const key = `${directory}::${pattern}`;
          if (watcherKeys.has(key)) {
            continue;
          }

          watcherKeys.add(key);
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(directory, pattern)
          );
          this.registerWatcher(watcher);
        }
      }

      for (const pattern of extraPatterns) {
        const key = `${workspacePath}::${pattern}`;
        if (watcherKeys.has(key)) {
          continue;
        }

        watcherKeys.add(key);
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(workspacePath, pattern)
        );
        this.registerWatcher(watcher);
      }
    }
  }

  refresh(filePath?: string): void {
    this.invalidateCache(filePath);
    if (!filePath) {
      void this.setupFileWatchers();
    }
    this._onDidChangeTreeData.fire();
  }

  async findTestFiles(): Promise<FlowTestSuite[]> {
    const suites: FlowTestSuite[] = [];

    if (!vscode.workspace.workspaceFolders) {
      return suites;
    }

    const processedFiles = new Set<string>();
    const processedDirectories = new Set<string>();

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const workspacePath = workspaceFolder.uri.fsPath;
      let config: FlowTestConfig;

      try {
        config = await this.configService.getConfig(workspacePath);
      } catch (error) {
        console.warn(
          `Failed to load Flow Test configuration for ${workspacePath}:`,
          error
        );
        continue;
      }

      const searchDirectories = await this.resolveSearchDirectories(
        config,
        workspacePath,
        processedDirectories
      );

      if (searchDirectories.length === 0) {
        continue;
      }

      const patterns = config.discovery?.patterns ?? ["**/*.yml", "**/*.yaml"];
      const excludePatterns = config.discovery?.exclude ?? [
        "**/node_modules/**",
      ];

      for (const directory of searchDirectories) {
        await this.collectSuitesInDirectory(
          directory,
          patterns,
          excludePatterns,
          processedFiles,
          suites
        );
      }
    }

    return suites;
  }

  private async resolveSearchDirectories(
    config: FlowTestConfig,
    workspacePath: string,
    processedDirectories: Set<string>
  ): Promise<string[]> {
    const directories =
      config.testDirectories && config.testDirectories.length > 0
        ? config.testDirectories
        : [workspacePath];

    const resolved: string[] = [];

    for (const dir of directories) {
      const normalized = this.normalizePath(dir);

      if (processedDirectories.has(normalized)) {
        continue;
      }

      if (!this.isPathInside(workspacePath, normalized)) {
        continue;
      }

      if (!(await this.isDirectory(normalized))) {
        continue;
      }

      processedDirectories.add(normalized);
      resolved.push(normalized);
    }

    return resolved;
  }

  private async collectSuitesInDirectory(
    directory: string,
    patterns: string[],
    excludePatterns: string[],
    processedFiles: Set<string>,
    suites: FlowTestSuite[]
  ): Promise<void> {
    const normalizedPatterns = patterns
      .map((pattern) => this.normalizeGlobPattern(pattern))
      .filter(Boolean);

    const normalizedExcludes = excludePatterns
      .map((pattern) => this.normalizeGlobPattern(pattern))
      .filter(Boolean);

    const excludeGlob = this.buildGlobUnion(normalizedExcludes);
    const excludePattern = excludeGlob
      ? new vscode.RelativePattern(directory, excludeGlob)
      : undefined;

    for (const pattern of normalizedPatterns) {
      try {
        const includePattern = new vscode.RelativePattern(directory, pattern);
        const files = await vscode.workspace.findFiles(
          includePattern,
          excludePattern
        );

        for (const file of files) {
          const normalizedPath = this.normalizePath(file.fsPath);
          if (processedFiles.has(normalizedPath)) {
            continue;
          }

          processedFiles.add(normalizedPath);
          const suite = await this.loadSuite(normalizedPath);
          if (suite) {
            suites.push(suite);
          }
        }
      } catch (error) {
        console.warn(
          `Failed to search for Flow Test files in ${directory} with pattern ${pattern}:`,
          error
        );
      }
    }
  }

  private buildGlobUnion(patterns: string[]): string | undefined {
    if (patterns.length === 0) {
      return undefined;
    }

    if (patterns.length === 1) {
      return patterns[0];
    }

    return `{${patterns.join(",")}}`;
  }

  private normalizeGlobPattern(pattern: string): string {
    if (!pattern) {
      return "";
    }

    let normalized = pattern.replace(/\\/g, "/").trim();

    if (!normalized) {
      return "";
    }

    if (normalized.startsWith("./")) {
      normalized = normalized.substring(2);
    }

    if (normalized.startsWith("/")) {
      normalized = normalized.substring(1);
    }

    normalized = normalized.replace(/\/{2,}/g, "/");

    return normalized;
  }

  private isPathInside(rootPath: string, candidatePath: string): boolean {
    const normalizedRoot = this.normalizePath(rootPath);
    const normalizedCandidate = this.normalizePath(candidatePath);
    const relative = path.relative(normalizedRoot, normalizedCandidate);

    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  }

  private async isDirectory(targetPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(targetPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private isFlowTestFile(parsed: any): boolean {
    if (!parsed) {
      return false;
    }

    const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    if (steps.length === 0) {
      return false;
    }

    const hasValidStep = steps.every((step: any) => {
      if (!step || !step.name) {
        return false;
      }

      const hasRequest =
        step.request &&
        typeof step.request === "object" &&
        typeof step.request.method === "string" &&
        step.request.method.trim().length > 0 &&
        typeof step.request.url === "string" &&
        step.request.url.trim().length > 0;

      const hasInput = step.input !== undefined && step.input !== null;

      const hasCall =
        step.call &&
        typeof step.call === "object" &&
        typeof step.call.test === "string" &&
        step.call.test.trim().length > 0;

      return hasRequest || hasInput || hasCall;
    });

    return hasValidStep;
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
      const content = await fs.promises.readFile(normalizedPath, "utf8");
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
        steps: parsed.steps || [],
      };

      this.suiteCache.set(normalizedPath, {
        mtimeMs: stats.mtimeMs,
        suite,
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
    this.configService.invalidateConfigForFile(filePath);
    if (this.looksLikeConfigFile(filePath)) {
      void this.setupFileWatchers();
    }
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

  private registerWatcher(watcher: vscode.FileSystemWatcher): void {
    this.watchers.push(watcher);
    watcher.onDidCreate((uri) => this.handleFileEvent(uri.fsPath));
    watcher.onDidChange((uri) => this.handleFileEvent(uri.fsPath));
    watcher.onDidDelete((uri) => this.handleFileEvent(uri.fsPath));
  }

  private disposeWatchers(): void {
    if (this.watchers.length === 0) {
      return;
    }

    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  private looksLikeConfigFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    return (
      name === "flow-test.config.yml" ||
      name === "flow-test.config.yaml" ||
      name === "test-config.yml" ||
      name === "test-config.yaml"
    );
  }

  dispose(): void {
    this.disposeWatchers();
  }
}
