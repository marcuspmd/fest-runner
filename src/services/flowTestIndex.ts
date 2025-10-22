import * as vscode from "vscode";
import * as path from "path";
import { FlowTestSuite, FlowTestStep } from "../models/types";
import { TestScanner } from "../testScanner";

export interface FlowTestSuiteMetadata {
  suite: FlowTestSuite;
  identifiers: string[];
  scenarioNames: string[];
  exportedVariables: string[];
  variableNames: string[];
  capturedVariables: string[];
  stepNames: string[];
  workspacePath?: string;
}

export class FlowTestIndex implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this.onDidChangeEmitter.event;

  private suiteByPath: Map<string, FlowTestSuiteMetadata> = new Map();
  private suiteByIdentifier: Map<string, FlowTestSuiteMetadata> = new Map();
  private cachedMetadata: FlowTestSuiteMetadata[] = [];

  constructor(private readonly testScanner: TestScanner) {
    this.disposables.push(
      this.testScanner.onDidChangeTreeData(() => {
        void this.refresh();
      })
    );

    void this.refresh();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  async refresh(): Promise<void> {
    const suites = await this.testScanner.findTestFiles();
    const metadata = suites.map((suite) => this.buildMetadata(suite));

    this.cachedMetadata = metadata;
    this.suiteByPath = new Map(
      metadata.map((entry) => [this.normalizePath(entry.suite.filePath), entry])
    );
    this.suiteByIdentifier = new Map();

    for (const entry of metadata) {
      for (const identifier of entry.identifiers) {
        const key = identifier.toLowerCase();
        if (!this.suiteByIdentifier.has(key)) {
          this.suiteByIdentifier.set(key, entry);
        }
      }
    }

    this.onDidChangeEmitter.fire();
  }

  getSuites(): FlowTestSuiteMetadata[] {
    return this.cachedMetadata;
  }

  getSuiteByIdentifier(identifier: string | undefined): FlowTestSuiteMetadata | undefined {
    if (!identifier) {
      return undefined;
    }
    return this.suiteByIdentifier.get(identifier.trim().toLowerCase());
  }

  getMetadataForDocument(document: vscode.TextDocument): FlowTestSuiteMetadata | undefined {
    const normalized = this.normalizePath(document.uri.fsPath);
    return this.suiteByPath.get(normalized);
  }

  getAllSuiteIdentifiers(): string[] {
    const identifiers = new Set<string>();
    for (const entry of this.cachedMetadata) {
      entry.identifiers.forEach((value) => identifiers.add(value));
    }
    return Array.from(identifiers);
  }

  getAllNodeIds(): string[] {
    const identifiers = new Set<string>();
    for (const entry of this.cachedMetadata) {
      if (entry.suite.node_id) {
        identifiers.add(entry.suite.node_id);
      }
    }
    return Array.from(identifiers);
  }

  getAllScenarioNames(): string[] {
    const scenarios = new Set<string>();
    for (const entry of this.cachedMetadata) {
      entry.scenarioNames.forEach((name) => scenarios.add(name));
    }
    return Array.from(scenarios);
  }

  getAllVariableNames(): string[] {
    const variables = new Set<string>();
    for (const entry of this.cachedMetadata) {
      entry.variableNames.forEach((name) => variables.add(name));
      entry.exportedVariables.forEach((name) => variables.add(name));
      entry.capturedVariables.forEach((name) => variables.add(name));
    }
    return Array.from(variables);
  }

  private buildMetadata(suite: FlowTestSuite): FlowTestSuiteMetadata {
    const workspacePath = vscode.workspace
      .getWorkspaceFolder(vscode.Uri.file(suite.filePath))
      ?.uri.fsPath;

    const identifiers = this.collectIdentifiers(suite, workspacePath);
    const stepNames = suite.steps
      .map((step) => this.resolveStepName(step))
      .filter(Boolean) as string[];

    const raw = suite.raw ?? {};
    const scenarioNames = this.collectScenarioNames(raw);
    const exportedVariables = this.collectExportedVariables(raw, suite.steps);
    const variableNames = this.collectVariableNames(raw);
    const capturedVariables = this.collectCapturedVariables(suite.steps);

    return {
      suite,
      identifiers,
      scenarioNames,
      exportedVariables,
      variableNames,
      capturedVariables,
      stepNames,
      workspacePath,
    };
  }

  private collectIdentifiers(suite: FlowTestSuite, workspacePath?: string): string[] {
    const identifiers = new Set<string>();
    const add = (value: string | undefined) => {
      if (!value) {
        return;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return;
      }
      identifiers.add(trimmed);
      identifiers.add(trimmed.toLowerCase());
    };

    add(suite.suite_name);
    add(suite.name);
    add(suite.node_id);

    const fileName = path.basename(suite.filePath);
    add(fileName);
    add(path.basename(fileName, path.extname(fileName)));

    if (workspacePath && suite.filePath.startsWith(workspacePath)) {
      const relative = path
        .relative(workspacePath, suite.filePath)
        .replace(/\\/g, "/");
      add(relative);
    }

    return Array.from(identifiers);
  }

  private collectScenarioNames(raw: any): string[] {
    const scenarios = Array.isArray(raw?.scenarios) ? raw.scenarios : [];
    return scenarios
      .map((scenario: any) =>
        typeof scenario?.name === "string" ? scenario.name.trim() : null
      )
      .filter((name: string | null): name is string => Boolean(name));
  }

  private collectExportedVariables(raw: any, steps: FlowTestStep[]): string[] {
    const exported: Set<string> = new Set();

    const suiteExports = Array.isArray(raw?.exports) ? raw.exports : [];
    suiteExports.forEach((item: any) => {
      if (typeof item === "string") {
        exported.add(item);
      }
    });

    for (const step of steps) {
      const captures = Array.isArray((step as any)?.captures)
        ? (step as any).captures
        : [];
      captures.forEach((entry: any) => {
        const name =
          typeof entry === "string"
            ? entry
            : typeof entry?.as === "string"
            ? entry.as
            : undefined;
        if (name) {
          exported.add(name);
        }
      });
    }

    return Array.from(exported);
  }

  private collectVariableNames(raw: any): string[] {
    const variables = raw?.variables;
    if (variables && typeof variables === "object") {
      return Object.keys(variables);
    }
    return [];
  }

  private collectCapturedVariables(steps: FlowTestStep[]): string[] {
    const captures = new Set<string>();
    for (const step of steps) {
      if (Array.isArray((step as any)?.captures)) {
        for (const entry of (step as any).captures) {
          if (typeof entry === "string") {
            captures.add(entry);
          } else if (entry && typeof entry === "object" && entry.as) {
            captures.add(String(entry.as));
          }
        }
      }
    }
    return Array.from(captures);
  }

  private resolveStepName(step: FlowTestStep): string | undefined {
    if (typeof step?.name === "string" && step.name.trim().length > 0) {
      return step.name.trim();
    }
    if (typeof step?.step_id === "string" && step.step_id.trim().length > 0) {
      return step.step_id.trim();
    }
    return undefined;
  }

  private normalizePath(target: string): string {
    return path.normalize(target).replace(/\\/g, "/").toLowerCase();
  }
}
