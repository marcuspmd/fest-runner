import * as vscode from 'vscode';
import { FlowTestProvider } from './testProvider';
import { TestScanner } from './testScanner';
import { TestRunner } from './testRunner';
import { ConfigService } from './services/configService';
import { HtmlResultsService } from './services/htmlResultsService';

export function activate(context: vscode.ExtensionContext) {
  const testScanner = new TestScanner();
  const testRunner = new TestRunner();
  const testProvider = new FlowTestProvider(testScanner, testRunner);
  const configService = ConfigService.getInstance();
  const htmlResultsService = HtmlResultsService.getInstance();

  vscode.window.registerTreeDataProvider('flowTestExplorer', testProvider);

  const commands = [
    vscode.commands.registerCommand('flow-test-runner.refresh', () => {
      testProvider.refresh();
    }),

    vscode.commands.registerCommand('flow-test-runner.runTest', (item) => {
      if (item) {
        testProvider.runTest(item);
      }
    }),

    vscode.commands.registerCommand('flow-test-runner.runSuite', (item) => {
      if (item) {
        testProvider.runTest(item);
      }
    }),

    vscode.commands.registerCommand('flow-test-runner.openTest', (item) => {
      if (item) {
        testProvider.openTestFile(item);
      }
    }),

    vscode.commands.registerCommand('flow-test-runner.retest', async () => {
      await testRunner.retestLast();
    }),

    vscode.commands.registerCommand('flow-test-runner.viewResults', async (item) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      const suiteName = item?.suite?.name || item?.label;
      await htmlResultsService.showResults(workspaceFolder.uri.fsPath, suiteName);
    }),

    vscode.commands.registerCommand('flow-test-runner.createConfig', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      await configService.createDefaultConfigFile(workspaceFolder.uri.fsPath);
    }),

    vscode.commands.registerCommand('flow-test-runner.selectConfig', async () => {
      await configService.promptForConfigFile();
    }),

    vscode.commands.registerCommand('flow-test-runner.clearInputCache', async () => {
      await testRunner.clearInputCache();
    }),

    vscode.commands.registerCommand('flow-test-runner.showCachedInputs', async () => {
      await testRunner.showCachedInputs();
    }),

    vscode.commands.registerCommand('flow-test-runner.editCachedInput', async () => {
      await testRunner.editCachedInput();
    })
  ];

  context.subscriptions.push(
    ...commands,
    testScanner,
    testRunner,
    htmlResultsService
  );

  checkForFlowTests();
}

async function checkForFlowTests() {
  const hasFlowTests = await hasFlowTestFiles();
  vscode.commands.executeCommand('setContext', 'workspaceHasFlowTests', hasFlowTests);
}

async function hasFlowTestFiles(): Promise<boolean> {
  if (!vscode.workspace.workspaceFolders) {
    return false;
  }

  try {
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, '**/*.{yml,yaml}'),
        '**/node_modules/**',
        1
      );

      if (files.length > 0) {
        return true;
      }
    }
  } catch (error) {
    console.warn('Error checking for Flow Test files:', error);
  }

  return false;
}

export function deactivate() {}