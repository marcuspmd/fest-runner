import * as vscode from 'vscode';
import { FlowTestProvider } from './testProvider';
import { TestScanner } from './testScanner';
import { TestRunner } from './testRunner';

export function activate(context: vscode.ExtensionContext) {
  const testScanner = new TestScanner();
  const testRunner = new TestRunner();
  const testProvider = new FlowTestProvider(testScanner, testRunner);

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
    })
  ];

  context.subscriptions.push(
    ...commands,
    testScanner,
    testRunner
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