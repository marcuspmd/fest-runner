import * as vscode from 'vscode';
import * as path from 'path';
import { FlowTestSuite, FlowTestStep, TestStatus } from './models/types';
import { TestScanner } from './testScanner';
import { TestRunner } from './testRunner';

export class FlowTestItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'suite' | 'step',
    public readonly filePath?: string,
    public readonly stepName?: string,
    public readonly stepId?: string,
    public status: TestStatus = 'pending'
  ) {
    super(label, collapsibleState);

    this.contextValue = this.getContextValue();
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();

    if (type === 'suite' && filePath) {
      this.resourceUri = vscode.Uri.file(filePath);
    }
  }

  private getTooltip(): string {
    switch (this.type) {
      case 'suite':
        return `Flow Test Suite: ${this.label}${this.filePath ? `\nFile: ${this.filePath}` : ''}`;
      case 'step':
        return `Test Step: ${this.label}` +
          (this.stepId ? `\nStep ID: ${this.stepId}` : '') +
          (this.status !== 'pending' ? `\nStatus: ${this.status}` : '');
      default:
        return this.label;
    }
  }

  private getContextValue(): string {
    if (this.type === 'suite') {
      return 'suite';
    }

    return this.stepId ? 'step-with-id' : 'step-without-id';
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.type === 'suite') {
      return new vscode.ThemeIcon('folder-opened');
    }

    switch (this.status) {
      case 'running':
        return new vscode.ThemeIcon('loading~spin');
      case 'passed':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      case 'failed':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  updateStatus(status: TestStatus): void {
    this.status = status;
    this.iconPath = this.getIcon();
    this.tooltip = this.getTooltip();
  }
}

export class FlowTestProvider implements vscode.TreeDataProvider<FlowTestItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FlowTestItem | undefined | null | void> = new vscode.EventEmitter<FlowTestItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FlowTestItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private testItems: Map<string, FlowTestItem> = new Map();

  constructor(
    private testScanner: TestScanner,
    private testRunner: TestRunner
  ) {
    this.testScanner.onDidChangeTreeData(() => this.refresh());
    this.testRunner.onTestResult((result) => {
      const key = `${result.suite}-${result.step}`;
      const item = this.testItems.get(key);
      if (item) {
        item.updateStatus(result.status);
        this._onDidChangeTreeData.fire(item);
      }
    });
  }

  refresh(): void {
    this.testItems.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FlowTestItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FlowTestItem): Promise<FlowTestItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (element.type === 'suite' && element.filePath) {
      return this.getStepItems(element.filePath);
    }

    return [];
  }

  private async getRootItems(): Promise<FlowTestItem[]> {
    try {
      const suites = await this.testScanner.findTestFiles();

      if (suites.length === 0) {
        return [];
      }

      return suites.map(suite => {
        const item = new FlowTestItem(
          suite.suite_name || suite.name,
          vscode.TreeItemCollapsibleState.Expanded,
          'suite',
          suite.filePath
        );
        this.testItems.set(suite.filePath, item);
        return item;
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load test suites: ${error}`);
      return [];
    }
  }

  private async getStepItems(suitePath: string): Promise<FlowTestItem[]> {
    try {
      const suites = await this.testScanner.findTestFiles();
      const suite = suites.find(s => s.filePath === suitePath);

      if (!suite) {
        return [];
      }

      return suite.steps.map(step => {
        const item = new FlowTestItem(
          step.name,
          vscode.TreeItemCollapsibleState.None,
          'step',
          suitePath,
          step.name,
          step.step_id
        );
        if (step.step_id) {
          item.description = step.step_id;
        }
        const key = `${path.basename(suitePath)}-${step.name}`;
        this.testItems.set(key, item);
        return item;
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load test steps: ${error}`);
      return [];
    }
  }

  async runTest(item: FlowTestItem): Promise<void> {
    if (!item.filePath) {
      return;
    }

    if (item.type === 'suite') {
      await this.testRunner.runSuite(item.filePath);
    } else if (item.type === 'step' && item.stepName) {
      if (!item.stepId) {
        vscode.window.showWarningMessage('Este step não possui step_id definido e não pode ser executado isoladamente.');
        return;
      }
      item.updateStatus('running');
      this._onDidChangeTreeData.fire(item);
      try {
        await this.testRunner.runStep(item.filePath, item.stepName, item.stepId);
      } catch {
        item.updateStatus('failed');
        this._onDidChangeTreeData.fire(item);
      }
    }
  }

  openTestFile(item: FlowTestItem): void {
    if (item.filePath) {
      vscode.window.showTextDocument(vscode.Uri.file(item.filePath));
    }
  }
}
