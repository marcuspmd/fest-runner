import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FlowTestProvider } from "./testProvider";
import { TestScanner } from "./testScanner";
import { TestRunner } from "./testRunner";
import { ConfigService } from "./services/configService";
import { HtmlResultsService } from "./services/htmlResultsService";
import { FlowTestConfig } from "./models/types";

export function activate(context: vscode.ExtensionContext) {
  const testScanner = new TestScanner();
  const testRunner = new TestRunner();
  const testProvider = new FlowTestProvider(testScanner, testRunner);
  const configService = ConfigService.getInstance();
  const htmlResultsService = HtmlResultsService.getInstance();

  vscode.window.registerTreeDataProvider("flowTestExplorer", testProvider);

  const commands = [
    vscode.commands.registerCommand("flow-test-runner.refresh", () => {
      testProvider.refresh();
    }),

    vscode.commands.registerCommand("flow-test-runner.runTest", (item) => {
      if (item) {
        testProvider.runTest(item);
      }
    }),

    vscode.commands.registerCommand("flow-test-runner.runSuite", (item) => {
      if (item) {
        testProvider.runTest(item);
      }
    }),

    vscode.commands.registerCommand(
      "flow-test-runner.runWithCache",
      (item) => {
        if (item) {
          testProvider.runTestWithCache(item);
        }
      }
    ),

    vscode.commands.registerCommand("flow-test-runner.runAll", async () => {
      await testProvider.runAllSuites();
    }),

    vscode.commands.registerCommand(
      "flow-test-runner.filterTests",
      async () => {
        await testProvider.promptForFilter();
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.clearFilter",
      () => {
        testProvider.clearFilter();
      }
    ),

    vscode.commands.registerCommand("flow-test-runner.openTest", (item) => {
      if (item) {
        testProvider.openTestFile(item);
      }
    }),

    vscode.commands.registerCommand("flow-test-runner.retest", async () => {
      await testRunner.retestLast();
    }),

    vscode.commands.registerCommand(
      "flow-test-runner.viewResults",
      async (item) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        const suiteName = item?.suite?.name || item?.label;
        await htmlResultsService.showResults(
          workspaceFolder.uri.fsPath,
          suiteName
        );
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.viewLatestResults",
      async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        await htmlResultsService.showResults(workspaceFolder.uri.fsPath);
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.createConfig",
      async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        await configService.createDefaultConfigFile(workspaceFolder.uri.fsPath);
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.selectConfig",
      async () => {
        await configService.promptForConfigFile();
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.clearInputCache",
      async () => {
        await testRunner.clearInputCache();
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.showCachedInputs",
      async () => {
        await testRunner.showCachedInputs();
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.editCachedInput",
      async () => {
        await testRunner.editCachedInput();
      }
    ),
  ];

  context.subscriptions.push(
    ...commands,
    testScanner,
    testRunner,
    htmlResultsService
  );

  checkForFlowTests(configService);
}

async function checkForFlowTests(configService: ConfigService) {
  const hasFlowTests = await hasFlowTestFiles(configService);
  vscode.commands.executeCommand(
    "setContext",
    "workspaceHasFlowTests",
    hasFlowTests
  );
}

async function hasFlowTestFiles(configService: ConfigService): Promise<boolean> {
  if (!vscode.workspace.workspaceFolders) {
    return false;
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const workspacePath = workspaceFolder.uri.fsPath;
    let config: FlowTestConfig;

    try {
      config = await configService.getConfig(workspacePath);
    } catch (error) {
      console.warn(
        `Error loading Flow Test configuration for ${workspacePath}:`,
        error
      );
      continue;
    }

    const searchDirectories = await resolveCandidateDirectories(config, workspacePath);
    if (searchDirectories.length === 0) {
      continue;
    }

    const patterns = normalizeGlobList(config.discovery?.patterns ?? ["**/*.{yml,yaml}"]);
    const excludePatterns = normalizeGlobList(config.discovery?.exclude ?? ["**/node_modules/**"]);
    const excludeGlob = buildGlobUnion(excludePatterns);

    for (const directory of searchDirectories) {
      const excludePattern = excludeGlob
        ? new vscode.RelativePattern(directory, excludeGlob)
        : undefined;

      for (const pattern of patterns) {
        try {
          const includePattern = new vscode.RelativePattern(directory, pattern);
          const files = await vscode.workspace.findFiles(
            includePattern,
            excludePattern,
            1
          );

          if (files.length > 0) {
            return true;
          }
        } catch (error) {
          console.warn(
            `Error searching for Flow Test files in ${directory} with pattern ${pattern}:`,
            error
          );
        }
      }
    }
  }

  return false;
}

async function resolveCandidateDirectories(
  config: FlowTestConfig,
  workspacePath: string
): Promise<string[]> {
  const directories =
    (config.testDirectories && config.testDirectories.length > 0)
      ? config.testDirectories
      : [workspacePath];

  const resolved: string[] = [];

  for (const dir of directories) {
    const normalized = path.normalize(dir);

    if (!isPathInside(workspacePath, normalized)) {
      continue;
    }

    if (!(await isDirectory(normalized))) {
      continue;
    }

    resolved.push(normalized);
  }

  return resolved;
}

function normalizeGlobList(values: string[]): string[] {
  return values
    .map(value => normalizeGlobPattern(value))
    .filter((value, index, array) => value && array.indexOf(value) === index);
}

function normalizeGlobPattern(pattern: string): string {
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

  return normalized.replace(/\/{2,}/g, "/");
}

function buildGlobUnion(patterns: string[]): string | undefined {
  if (patterns.length === 0) {
    return undefined;
  }

  if (patterns.length === 1) {
    return patterns[0];
  }

  return `{${patterns.join(",")}}`;
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = path.normalize(rootPath);
  const normalizedCandidate = path.normalize(candidatePath);
  const relative = path.relative(normalizedRoot, normalizedCandidate);

  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function deactivate() {}
