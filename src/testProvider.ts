import * as vscode from "vscode";
import * as path from "path";
import {
  FlowTestSuite,
  TestStatus,
  TestResult,
  SuiteResult,
  FlowTestStep,
} from "./models/types";
import { TestScanner } from "./testScanner";
import { TestRunner } from "./testRunner";

export class FlowTestItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: "folder" | "suite" | "step",
    public readonly filePath?: string,
    public readonly stepName?: string,
    public readonly stepId?: string,
    public status: TestStatus = "pending"
  ) {
    super(label, collapsibleState);

    this.contextValue = this.getContextValue();
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();

    if ((type === "suite" || type === "folder") && filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
    }
  }

  private getTooltip(): string {
    switch (this.type) {
      case "folder":
        return `Test Folder: ${this.label}${
          this.filePath ? `\nPath: ${this.filePath}` : ""
        }`;
      case "suite":
        return `Flow Test Suite: ${this.label}${
          this.filePath ? `\nFile: ${this.filePath}` : ""
        }`;
      case "step":
        return (
          `Test Step: ${this.label}` +
          (this.stepId ? `\nStep ID: ${this.stepId}` : "") +
          (this.status !== "pending" ? `\nStatus: ${this.status}` : "")
        );
      default:
        return this.label;
    }
  }

  private getContextValue(): string {
    if (this.type === "folder") {
      return "folder";
    }
    if (this.type === "suite") {
      return "suite";
    }

    return this.stepId ? "step-with-id" : "step-without-id";
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.type === "folder") {
      return new vscode.ThemeIcon("folder");
    }
    if (this.type === "suite") {
      return new vscode.ThemeIcon("folder-opened");
    }

    switch (this.status) {
      case "running":
        return new vscode.ThemeIcon("loading~spin");
      case "passed":
        return new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("testing.iconPassed")
        );
      case "failed":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("testing.iconFailed")
        );
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }

  updateStatus(status: TestStatus): void {
    this.status = status;
    this.iconPath = this.getIcon();
    this.tooltip = this.getTooltip();
  }
}

interface FolderTreeNode {
  name: string;
  path: string;
  workspacePath: string;
  parentPath?: string;
  childFolderPaths: Set<string>;
  suites: FlowTestSuite[];
}

export class FlowTestProvider implements vscode.TreeDataProvider<FlowTestItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FlowTestItem | undefined | null | void
  > = new vscode.EventEmitter<FlowTestItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    FlowTestItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private testItems: Map<string, FlowTestItem> = new Map();
  private suiteMetadataByKey: Map<string, FlowTestSuite> = new Map();
  private suiteItemsByKey: Map<string, FlowTestItem> = new Map();
  private stepStatusCache: Map<string, TestStatus> = new Map();
  private suiteStatusCache: Map<string, TestStatus> = new Map();
  private filterText: string | undefined;
  private normalizedFilter: string | undefined;
  private suiteFilterResults: Map<string, SuiteFilterResult> = new Map();
  private folderNodesByPath: Map<string, FolderTreeNode> = new Map();
  private workspaceRootKeys: string[] = [];
  private displayWorkspaceRoots = false;
  private cachedSuites: FlowTestSuite[] = [];

  constructor(
    private testScanner: TestScanner,
    private testRunner: TestRunner
  ) {
    this.testScanner.onDidChangeTreeData(() => this.refresh());
    this.testRunner.onTestResult(async (result) => {
      await this.handleTestResult(result);
    });
    this.testRunner.onSuiteResult(async (result) => {
      await this.handleSuiteResult(result);
    });
    this.updateFilterContext();
  }

  refresh(): void {
    this.testItems.clear();
    this.suiteItemsByKey.clear();
    this.suiteFilterResults.clear();
    this.folderNodesByPath.clear();
    this.workspaceRootKeys = [];
    this.cachedSuites = [];
    this.displayWorkspaceRoots = false;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FlowTestItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FlowTestItem): Promise<FlowTestItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (element.type === "folder" && element.filePath) {
      return this.getFolderItems(element.filePath);
    }

    if (element.type === "suite" && element.filePath) {
      return this.getStepItems(element.filePath);
    }

    return [];
  }

  private async getRootItems(): Promise<FlowTestItem[]> {
    try {
      await this.rebuildFolderTree();

      if (this.cachedSuites.length === 0) {
        return [];
      }

      if (this.displayWorkspaceRoots) {
        return this.workspaceRootKeys
          .map((key) => this.folderNodesByPath.get(key))
          .filter((node): node is FolderTreeNode => Boolean(node))
          .sort((a, b) => this.compareLabels(a.name, b.name))
          .map((node) => this.createFolderItem(node));
      }

      const rootKey = this.workspaceRootKeys[0];
      if (!rootKey) {
        return [];
      }

      const rootNode = this.folderNodesByPath.get(rootKey);
      if (!rootNode) {
        return [];
      }

      return this.getFolderChildrenItems(rootNode);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load test suites: ${error}`);
      return [];
    }
  }

  private async rebuildFolderTree(): Promise<void> {
    const suites = await this.testScanner.findTestFiles();
    const includedSuites: FlowTestSuite[] = [];

    this.folderNodesByPath.clear();
    this.workspaceRootKeys = [];
    this.cachedSuites = [];

    for (const suite of suites) {
      this.registerSuiteMetadata(suite);
      const filterResult = this.evaluateSuiteFilter(suite);
      if (!filterResult.include) {
        continue;
      }
      includedSuites.push(suite);
    }

    this.cachedSuites = includedSuites;
    if (includedSuites.length === 0) {
      this.displayWorkspaceRoots = false;
      return;
    }

    this.buildFolderTree(includedSuites);
  }

  private buildFolderTree(suites: FlowTestSuite[]): void {
    this.folderNodesByPath.clear();
    this.workspaceRootKeys = [];

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    this.displayWorkspaceRoots = workspaceFolders.length > 1;

    const rootKeys = new Set<string>();

    for (const suite of suites) {
      const suiteUri = vscode.Uri.file(suite.filePath);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(suiteUri);
      const workspacePath = path.normalize(
        workspaceFolder?.uri.fsPath ?? path.dirname(suite.filePath)
      );
      const workspaceName =
        workspaceFolder?.name ?? path.basename(workspacePath);

      const rootNode = this.ensureFolderNode(
        workspacePath,
        workspaceName,
        workspacePath
      );
      rootKeys.add(rootNode.path);

      const relativePath = workspaceFolder
        ? path.relative(workspacePath, suite.filePath)
        : path.basename(suite.filePath);
      const directories = this.getDirectorySegments(relativePath);

      let currentNode = rootNode;
      let currentPath = rootNode.path;

      for (const directory of directories) {
        currentPath = path.normalize(path.join(currentPath, directory));
        const childNode = this.ensureFolderNode(
          currentPath,
          directory,
          rootNode.workspacePath,
          currentNode.path
        );
        currentNode.childFolderPaths.add(childNode.path);
        currentNode = childNode;
      }

      currentNode.suites.push(suite);
    }

    this.workspaceRootKeys = Array.from(rootKeys);
  }

  private ensureFolderNode(
    folderPath: string,
    name: string,
    workspacePath: string,
    parentPath?: string
  ): FolderTreeNode {
    const normalizedPath = path.normalize(folderPath);
    let node = this.folderNodesByPath.get(normalizedPath);
    if (!node) {
      node = {
        name,
        path: normalizedPath,
        workspacePath: path.normalize(workspacePath),
        parentPath,
        childFolderPaths: new Set<string>(),
        suites: [],
      };
      this.folderNodesByPath.set(normalizedPath, node);
    } else {
      if (!node.parentPath && parentPath) {
        node.parentPath = parentPath;
      }
      if (!node.name) {
        node.name = name;
      }
    }
    return node;
  }

  private getDirectorySegments(relativePath: string): string[] {
    if (!relativePath) {
      return [];
    }

    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0) {
      return [];
    }

    segments.pop();
    return segments;
  }

  private compareLabels(a: string, b: string): number {
    return a.localeCompare(b, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  private getSuiteLabel(suite: FlowTestSuite): string {
    const nameCandidates = [suite.suite_name, suite.name];
    for (const candidate of nameCandidates) {
      const trimmed = candidate?.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return path.basename(suite.filePath);
  }

  private createSuiteItem(suite: FlowTestSuite): FlowTestItem {
    const item = new FlowTestItem(
      this.getSuiteLabel(suite),
      vscode.TreeItemCollapsibleState.Expanded,
      "suite",
      suite.filePath
    );
    this.testItems.set(suite.filePath, item);
    this.testItems.set(this.normalizePathKey(suite.filePath), item);
    this.registerSuiteMetadata(suite, item);
    const cachedStatus = this.getCachedSuiteStatus(suite);
    if (cachedStatus) {
      item.updateStatus(cachedStatus);
    }
    return item;
  }

  private createFolderItem(node: FolderTreeNode): FlowTestItem {
    const label = node.name || path.basename(node.path);
    return new FlowTestItem(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      "folder",
      node.path
    );
  }

  private getFolderChildrenItems(node: FolderTreeNode): FlowTestItem[] {
    const items: FlowTestItem[] = [];

    const folderChildren = Array.from(node.childFolderPaths)
      .map((childPath) => this.folderNodesByPath.get(childPath))
      .filter((child): child is FolderTreeNode => Boolean(child))
      .sort((a, b) => this.compareLabels(a.name, b.name));

    for (const child of folderChildren) {
      items.push(this.createFolderItem(child));
    }

    const suiteChildren = [...node.suites].sort((a, b) =>
      this.compareLabels(this.getSuiteLabel(a), this.getSuiteLabel(b))
    );

    for (const suite of suiteChildren) {
      items.push(this.createSuiteItem(suite));
    }

    return items;
  }

  private async getFolderItems(folderPath: string): Promise<FlowTestItem[]> {
    const normalizedPath = path.normalize(folderPath);
    let node = this.folderNodesByPath.get(normalizedPath);

    if (!node && this.cachedSuites.length === 0) {
      await this.rebuildFolderTree();
      node = this.folderNodesByPath.get(normalizedPath);
    }

    if (!node) {
      return [];
    }

    return this.getFolderChildrenItems(node);
  }

  private async getStepItems(suitePath: string): Promise<FlowTestItem[]> {
    try {
      const suites = await this.testScanner.findTestFiles();
      const suite = suites.find((s) => s.filePath === suitePath);

      if (!suite) {
        return [];
      }

      this.registerSuiteMetadata(suite);
      const filterResult = this.evaluateSuiteFilter(suite);
      if (!filterResult.include) {
        return [];
      }

      const allowedStepKeys = filterResult.stepKeys;

      return suite.steps
        .filter((step) => {
          if (!allowedStepKeys) {
            return true;
          }
          const stepKey = this.getStepKey(suitePath, step.name);
          return allowedStepKeys.has(stepKey);
        })
        .map((step) => {
          const item = new FlowTestItem(
            step.name,
            vscode.TreeItemCollapsibleState.None,
            "step",
            suitePath,
            step.name,
            step.step_id
          );
          if (step.step_id) {
            item.description = step.step_id;
          }
          const key = this.getStepKey(suitePath, step.name);
          this.testItems.set(key, item);
          const cachedStatus = this.stepStatusCache.get(key);
          if (cachedStatus) {
            item.updateStatus(cachedStatus);
          }
          return item;
        });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load test steps: ${error}`);
      return [];
    }
  }

  async promptForFilter(): Promise<void> {
    const value = await vscode.window.showInputBox({
      prompt: "Filtrar suites ou steps (nome, arquivo, metodo ou URL)",
      placeHolder: "Ex.: login, POST /auth, smoke",
      value: this.filterText ?? "",
    });

    if (value === undefined) {
      return;
    }

    this.setFilter(value);
  }

  clearFilter(): void {
    if (!this.normalizedFilter) {
      return;
    }

    this.setFilter(undefined);
  }

  async runTest(item: FlowTestItem): Promise<void> {
    await this.runTestInternal(item, { useCachedInputs: false });
  }

  async runTestWithCache(item: FlowTestItem): Promise<void> {
    await this.runTestInternal(item, { useCachedInputs: true });
  }

  private async runTestInternal(
    item: FlowTestItem,
    options: { useCachedInputs: boolean }
  ): Promise<void> {
    if (!item.filePath) {
      return;
    }

    if (item.type === "folder") {
      return;
    }

    const useCachedInputs = options.useCachedInputs;

    if (item.type === "suite") {
      const suite = await this.ensureSuiteMetadata(item.filePath);
      if (suite) {
        this.registerSuiteMetadata(suite, item);
        this.prepareSuiteForRun(suite);
      }
      try {
        await this.testRunner.runSuite(item.filePath, { useCachedInputs });
        if (suite) {
          const status = this.getCachedSuiteStatus(suite);
          if (status === "running") {
            this.setSuiteStatus(suite, "passed", true);
          }
        }
      } catch {
        if (suite) {
          this.setSuiteStatus(suite, "failed", true);
        }
        // Error already reported by TestRunner
      }
      return;
    }

    if (item.type === "step" && item.stepName) {
      if (!item.stepId) {
        vscode.window.showWarningMessage(
          "Este step não possui step_id definido e não pode ser executado isoladamente."
        );
        return;
      }
      const suite = await this.ensureSuiteMetadata(item.filePath);
      if (suite) {
        this.registerSuiteMetadata(suite, this.findSuiteItemBySuite(suite));
        this.setSuiteStatus(suite, "running", true);
        this.setStepStatus(suite, item.stepName, "running");
      }
      try {
        await this.testRunner.runStep(
          item.filePath,
          item.stepName,
          item.stepId,
          { useCachedInputs }
        );
      } catch {
        if (suite) {
          this.setSuiteStatus(suite, "failed", true);
          this.setStepStatus(suite, item.stepName!, "failed");
        } else {
          item.updateStatus("failed");
          this._onDidChangeTreeData.fire(item);
        }
      }
    }
  }

  async runAllSuites(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const suites = await this.testScanner.findTestFiles();

      if (suites.length === 0) {
        vscode.window.showInformationMessage(
          "Nenhuma suíte Flow Test encontrada."
        );
        return;
      }

      const suiteContexts = suites.map((suite) => {
        this.registerSuiteMetadata(suite);
        const suiteItem = this.findSuiteItemBySuite(suite);
        if (suiteItem) {
          this.registerSuiteMetadata(suite, suiteItem);
        }
        this.prepareSuiteForRun(suite);
        return suite;
      });

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Executando todas as Flow Test suites",
          cancellable: false,
        },
        async () => {
          try {
            await this.testRunner.runAll(workspaceFolder.uri.fsPath);
            suiteContexts.forEach((suite) => {
              const status = this.getCachedSuiteStatus(suite);
              if (status === "running") {
                this.setSuiteStatus(suite, "passed", true);
              }
            });
          } catch (error) {
            suiteContexts.forEach((suite) => {
              this.setSuiteStatus(suite, "failed", true);
            });
            throw error;
          }
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Falha ao executar todas as suítes: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async handleTestResult(result: TestResult): Promise<void> {
    if (!result.suite) {
      return;
    }

    let suite = this.findSuiteMetadataByKey(result.suite);
    if (!suite) {
      const suites = await this.testScanner.findTestFiles();
      suites.forEach((entry) => this.registerSuiteMetadata(entry));
      suite = this.findSuiteMetadataByKey(result.suite);
    }

    if (!suite) {
      return;
    }

    this.registerSuiteMetadata(suite);
    this.setStepStatus(suite, result.step, result.status);

    if (result.status === "failed") {
      this.setSuiteStatus(suite, "failed", true);
    }
  }

  private async handleSuiteResult(result: SuiteResult): Promise<void> {
    if (!result.suite && !result.filePath) {
      return;
    }

    let suite: FlowTestSuite | undefined;

    if (result.filePath) {
      suite = await this.ensureSuiteMetadata(result.filePath);
    }

    if (!suite && result.suite) {
      suite = this.findSuiteMetadataByKey(result.suite, result.filePath);
    }

    if (!suite && result.filePath) {
      suite = {
        name: path.basename(result.filePath, path.extname(result.filePath)),
        filePath: result.filePath,
        suite_name:
          result.suite ||
          path.basename(result.filePath, path.extname(result.filePath)),
        steps: [],
      } as FlowTestSuite;
      this.registerSuiteMetadata(suite);
    }

    if (!suite) {
      if (result.suite) {
        const keys = this.generateNameKeys(result.suite);
        keys.forEach((key) => this.suiteStatusCache.set(key, result.status));
      }
      return;
    }

    this.registerSuiteMetadata(suite);
    this.setSuiteStatus(suite, result.status, true);
  }

  private async ensureSuiteMetadata(
    filePath: string
  ): Promise<FlowTestSuite | undefined> {
    const normalizedPath = this.normalizePathKey(filePath);
    let suite = this.suiteMetadataByKey.get(normalizedPath);
    if (suite) {
      return suite;
    }

    const suites = await this.testScanner.findTestFiles();
    suites.forEach((entry) => this.registerSuiteMetadata(entry));
    suite = this.suiteMetadataByKey.get(normalizedPath);
    return suite;
  }

  private registerSuiteMetadata(
    suite: FlowTestSuite,
    item?: FlowTestItem
  ): void {
    const keys = this.collectSuiteKeys(suite);
    keys.forEach((key) => {
      if (!key) {
        return;
      }
      this.suiteMetadataByKey.set(key, suite);
      if (item) {
        this.suiteItemsByKey.set(key, item);
      }
    });
  }

  private collectSuiteKeys(suite: FlowTestSuite): string[] {
    const keys = new Set<string>();
    keys.add(this.normalizePathKey(suite.filePath));

    const baseName = path.basename(suite.filePath);
    this.generateNameKeys(baseName).forEach((key) => keys.add(key));

    const baseWithoutExt = path.basename(
      suite.filePath,
      path.extname(suite.filePath)
    );
    this.generateNameKeys(baseWithoutExt).forEach((key) => keys.add(key));

    this.generateNameKeys(suite.name).forEach((key) => keys.add(key));
    this.generateNameKeys(suite.suite_name).forEach((key) => keys.add(key));

    return Array.from(keys);
  }

  private generateNameKeys(value?: string): string[] {
    const normalized = this.normalizeNameKey(value);
    if (!normalized) {
      return [];
    }

    const keys = new Set<string>();
    keys.add(normalized);
    keys.add(normalized.replace(/\\/g, "/"));
    keys.add(normalized.replace(/\s+/g, " "));

    const sanitized = normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (sanitized) {
      keys.add(sanitized);
    }

    const compact = normalized.replace(/[^a-z0-9]+/g, "");
    if (compact) {
      keys.add(compact);
    }

    return Array.from(keys);
  }

  private normalizePathKey(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, "/").toLowerCase();
  }

  private normalizeNameKey(value?: string): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  private getCachedSuiteStatus(suite: FlowTestSuite): TestStatus | undefined {
    const keys = this.collectSuiteKeys(suite);
    let cached: TestStatus | undefined;
    for (const key of keys) {
      const status = this.suiteStatusCache.get(key);
      if (!status) {
        continue;
      }
      if (status === "failed") {
        return "failed";
      }
      if (!cached || status === "running") {
        cached = status;
      }
    }
    return cached;
  }

  private setSuiteStatus(
    suite: FlowTestSuite,
    status: TestStatus,
    force = false
  ): void {
    const keys = this.collectSuiteKeys(suite);
    const updatedItems = new Set<FlowTestItem>();

    for (const key of keys) {
      const existing = this.suiteStatusCache.get(key);
      if (!force) {
        if (existing === "failed" && status === "passed") {
          continue;
        }
        if (existing === status && status !== "running") {
          continue;
        }
      }
      this.suiteStatusCache.set(key, status);
      const item = this.suiteItemsByKey.get(key);
      if (item && !updatedItems.has(item)) {
        if (!force) {
          if (item.status === "failed" && status === "passed") {
            updatedItems.add(item);
            continue;
          }
          if (item.status === status && status !== "running") {
            updatedItems.add(item);
            continue;
          }
        }
        item.updateStatus(status);
        this._onDidChangeTreeData.fire(item);
        updatedItems.add(item);
      }
    }
  }

  private resetSuiteSteps(suite: FlowTestSuite): void {
    const prefix = `${this.normalizePathKey(suite.filePath)}::`;
    for (const key of Array.from(this.stepStatusCache.keys())) {
      if (key.startsWith(prefix)) {
        this.stepStatusCache.delete(key);
      }
    }

    for (const [key, item] of this.testItems.entries()) {
      if (key.startsWith(prefix) && item.type === "step") {
        item.updateStatus("pending");
        this._onDidChangeTreeData.fire(item);
      }
    }
  }

  private setStepStatus(
    suite: FlowTestSuite,
    stepName: string,
    status: TestStatus
  ): void {
    const key = this.getStepKey(suite.filePath, stepName);
    this.stepStatusCache.set(key, status);
    const item = this.testItems.get(key);
    if (item) {
      item.updateStatus(status);
      this._onDidChangeTreeData.fire(item);
    }
  }

  private setFilter(filter: string | undefined): void {
    const normalized = this.normalizeFilter(filter);
    if (normalized === this.normalizedFilter) {
      this.filterText = filter;
      return;
    }

    this.filterText = filter;
    this.normalizedFilter = normalized;
    this.suiteFilterResults.clear();
    this.updateFilterContext();
    this.refresh();
  }

  private normalizeFilter(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }

  private evaluateSuiteFilter(suite: FlowTestSuite): SuiteFilterResult {
    const key = this.normalizePathKey(suite.filePath);
    const cached = this.suiteFilterResults.get(key);
    if (cached) {
      return cached;
    }

    const normalizedFilter = this.normalizedFilter;
    if (!normalizedFilter) {
      const result: SuiteFilterResult = { include: true };
      this.suiteFilterResults.set(key, result);
      return result;
    }

    const suiteValues = [
      suite.suite_name,
      suite.name,
      path.basename(suite.filePath),
      suite.filePath,
    ];

    if (
      suiteValues.some(
        (value) => value && value.toLowerCase().includes(normalizedFilter)
      )
    ) {
      const result: SuiteFilterResult = { include: true };
      this.suiteFilterResults.set(key, result);
      return result;
    }

    const matchedSteps = new Set<string>();
    for (const step of suite.steps) {
      if (this.stepMatchesFilter(step, normalizedFilter)) {
        matchedSteps.add(this.getStepKey(suite.filePath, step.name));
      }
    }

    if (matchedSteps.size > 0) {
      const result: SuiteFilterResult = {
        include: true,
        stepKeys: matchedSteps,
      };
      this.suiteFilterResults.set(key, result);
      return result;
    }

    const result: SuiteFilterResult = { include: false };
    this.suiteFilterResults.set(key, result);
    return result;
  }

  private stepMatchesFilter(step: FlowTestStep, filter: string): boolean {
    const candidates = [
      step.name,
      step.step_id,
      step.request?.method,
      step.request?.url,
      step.call?.test,
      step.call?.step,
    ];

    return candidates.some(
      (value) => value && value.toLowerCase().includes(filter)
    );
  }

  private updateFilterContext(): void {
    void vscode.commands.executeCommand(
      "setContext",
      "flowTestRunner.filterActive",
      Boolean(this.normalizedFilter)
    );
  }

  private getStepKey(filePath: string, stepName: string): string {
    return `${this.normalizePathKey(filePath)}::${stepName
      .trim()
      .toLowerCase()}`;
  }

  private findSuiteMetadataByKey(
    name?: string,
    filePath?: string
  ): FlowTestSuite | undefined {
    const candidates = new Set<string>();

    if (filePath) {
      const normalizedPath = this.normalizePathKey(filePath);
      candidates.add(normalizedPath);
      const baseName = path.basename(filePath);
      this.generateNameKeys(baseName).forEach((key) => candidates.add(key));
      const baseWithoutExt = path.basename(filePath, path.extname(filePath));
      this.generateNameKeys(baseWithoutExt).forEach((key) =>
        candidates.add(key)
      );
    }

    this.generateNameKeys(name).forEach((key) => candidates.add(key));

    for (const key of candidates) {
      const suite = this.suiteMetadataByKey.get(key);
      if (suite) {
        return suite;
      }
    }

    return undefined;
  }

  private findSuiteItemBySuite(suite: FlowTestSuite): FlowTestItem | undefined {
    const keys = this.collectSuiteKeys(suite);
    for (const key of keys) {
      const item = this.suiteItemsByKey.get(key);
      if (item) {
        return item;
      }
    }
    return undefined;
  }

  private prepareSuiteForRun(suite: FlowTestSuite): void {
    this.resetSuiteSteps(suite);
    this.setSuiteStatus(suite, "running", true);
  }

  openTestFile(item: FlowTestItem): void {
    if (item.filePath) {
      vscode.window.showTextDocument(vscode.Uri.file(item.filePath));
    }
  }
}

interface SuiteFilterResult {
  include: boolean;
  stepKeys?: Set<string>;
}
