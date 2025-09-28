import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FlowTestProvider } from "./testProvider";
import { TestScanner } from "./testScanner";
import { TestRunner } from "./testRunner";
import { ConfigService } from "./services/configService";
import { HtmlResultsService } from "./services/htmlResultsService";
import { GraphService, GraphGenerationResult } from "./services/graphService";
import { FlowTestConfig, FlowTestGraphDirection } from "./models/types";

export function activate(context: vscode.ExtensionContext) {
  const testScanner = new TestScanner();
  const testRunner = new TestRunner();
  const testProvider = new FlowTestProvider(testScanner, testRunner);
  const configService = ConfigService.getInstance();
  const htmlResultsService = HtmlResultsService.getInstance();
  const graphService = GraphService.getInstance();

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

    vscode.commands.registerCommand("flow-test-runner.runWithCache", (item) => {
      if (item) {
        testProvider.runTestWithCache(item);
      }
    }),

    vscode.commands.registerCommand("flow-test-runner.runAll", async () => {
      await testProvider.runAllSuites();
    }),

    vscode.commands.registerCommand(
      "flow-test-runner.filterTests",
      async () => {
        await testProvider.promptForFilter();
      }
    ),

    vscode.commands.registerCommand("flow-test-runner.clearFilter", () => {
      testProvider.clearFilter();
    }),

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
      "flow-test-runner.generateGraph",
      async () => {
        await handleGenerateGraph(graphService, configService);
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

export async function handleGenerateGraph(
  graphService: GraphService,
  configService: ConfigService
): Promise<void> {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  let config: FlowTestConfig;
  try {
    config = await configService.getConfig(workspacePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to load Flow Test configuration: ${message}`
    );
    return;
  }

  const graphConfig = config.graph ?? {};
  const defaultOutputPath = resolveDefaultGraphOutputPath(
    workspacePath,
    config
  );

  const targetUri = await vscode.window.showSaveDialog({
    title: "Save Flow Test discovery graph",
    saveLabel: "Generate Graph",
    defaultUri: vscode.Uri.file(defaultOutputPath),
    filters: {
      Mermaid: ["mmd", "mermaid"],
      Text: ["txt"],
    },
  });

  if (!targetUri) {
    return;
  }

  const direction = await promptGraphDirection(graphConfig.defaultDirection);
  if (direction === null) {
    return;
  }

  const noOrphans = await promptNoOrphans(graphConfig.noOrphans);
  if (noOrphans === null) {
    return;
  }

  const priority = await promptCommaSeparatedList(
    "Prioritize nodes",
    "Enter comma-separated priority nodes (optional)"
  );
  if (priority === null) {
    return;
  }

  const suites = await promptCommaSeparatedList(
    "Filter suites",
    "Enter comma-separated suite names to include (optional)"
  );
  if (suites === null) {
    return;
  }

  const nodes = await promptCommaSeparatedList(
    "Filter nodes",
    "Enter comma-separated node identifiers (optional)"
  );
  if (nodes === null) {
    return;
  }

  const tags = await promptCommaSeparatedList(
    "Filter tags",
    "Enter comma-separated tags to include (optional)"
  );
  if (tags === null) {
    return;
  }

  const titleInput = await vscode.window.showInputBox({
    title: "Graph title",
    prompt: "Provide a custom graph title (optional)",
    placeHolder: "Flow Test Discovery",
    ignoreFocusOut: true,
  });

  if (titleInput === undefined) {
    return;
  }

  const title = titleInput.trim().length > 0 ? titleInput.trim() : undefined;

  const options = {
    workspacePath,
    outputPath: targetUri.fsPath,
    direction: direction ?? undefined,
    noOrphans: noOrphans ?? undefined,
    priority: priority.length > 0 ? priority : undefined,
    suites: suites.length > 0 ? suites : undefined,
    nodes: nodes.length > 0 ? nodes : undefined,
    tags: tags.length > 0 ? tags : undefined,
    title,
  } satisfies Parameters<typeof graphService.generateMermaidGraph>[0];

  try {
    const result = await vscode.window.withProgress<GraphGenerationResult>(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating Flow Test discovery graph...",
      },
      async () => {
        return graphService.generateMermaidGraph(options);
      }
    );

    const relativeOutput = path.relative(workspacePath, result.outputPath);
    const outputDisplay =
      relativeOutput && !relativeOutput.startsWith("..")
        ? relativeOutput
        : result.outputPath;

    const openOption = "Open";
    const revealOption = "Reveal";

    const action = await vscode.window.showInformationMessage(
      `Flow Test graph saved to ${outputDisplay}`,
      openOption,
      revealOption
    );

    if (action === openOption) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(result.outputPath)
      );
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    } else if (action === revealOption) {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(result.outputPath)
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to generate Flow Test graph: ${message}`
    );
  }
}

async function selectWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  if (folders.length === 1) {
    return folders[0];
  }

  const pickItems = folders.map((folder) => ({
    label: folder.name ?? path.basename(folder.uri.fsPath),
    description: folder.uri.fsPath,
    folder,
  }));

  const pick = await vscode.window.showQuickPick(pickItems, {
    title: "Select workspace for Flow Test graph",
    placeHolder: "Workspace folder",
    ignoreFocusOut: true,
  });

  return pick?.folder;
}

function resolveDefaultGraphOutputPath(
  workspacePath: string,
  config: FlowTestConfig
): string {
  const graphConfig = config.graph ?? {};
  const baseDir = config.workingDirectory ?? workspacePath;
  const defaultOutput =
    graphConfig.defaultOutput?.trim() || "flow-discovery.mmd";

  if (path.isAbsolute(defaultOutput)) {
    return defaultOutput;
  }

  return path.join(baseDir, defaultOutput);
}

async function promptGraphDirection(
  defaultDirection?: FlowTestGraphDirection
): Promise<FlowTestGraphDirection | undefined | null> {
  const directionItems: Array<
    vscode.QuickPickItem & { value?: FlowTestGraphDirection }
  > = [
    {
      label: defaultDirection
        ? `Default (${describeDirection(defaultDirection)})`
        : "Use configuration default",
      description: "Use direction from configuration",
    },
    {
      label: "Top to bottom",
      description: "Mermaid TD",
      value: "TD",
    },
    {
      label: "Left to right",
      description: "Mermaid LR",
      value: "LR",
    },
    {
      label: "Bottom to top",
      description: "Mermaid BT",
      value: "BT",
    },
    {
      label: "Right to left",
      description: "Mermaid RL",
      value: "RL",
    },
  ];

  const selection = await vscode.window.showQuickPick(directionItems, {
    title: "Graph direction",
    placeHolder: "Choose graph layout direction",
    ignoreFocusOut: true,
  });

  if (!selection) {
    return null;
  }

  return selection.value;
}

async function promptNoOrphans(
  defaultValue?: boolean
): Promise<boolean | undefined | null> {
  const items: Array<vscode.QuickPickItem & { value?: boolean }> = [
    {
      label:
        defaultValue === true
          ? "Default (Yes)"
          : defaultValue === false
          ? "Default (No)"
          : "Use configuration default",
      description: "Use configuration option",
    },
    {
      label: "Yes",
      description: "Exclude orphan nodes",
      value: true,
    },
    {
      label: "No",
      description: "Include orphan nodes",
      value: false,
    },
  ];

  const selection = await vscode.window.showQuickPick(items, {
    title: "Exclude orphan nodes?",
    placeHolder: "Choose whether to hide orphan nodes",
    ignoreFocusOut: true,
  });

  if (!selection) {
    return null;
  }

  return selection.value;
}

async function promptCommaSeparatedList(
  title: string,
  prompt: string
): Promise<string[] | null> {
  const input = await vscode.window.showInputBox({
    title,
    prompt,
    placeHolder: "value-a, value-b",
    ignoreFocusOut: true,
  });

  if (input === undefined) {
    return null;
  }

  return parseCommaSeparatedList(input);
}

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function describeDirection(direction: FlowTestGraphDirection): string {
  switch (direction) {
    case "TD":
      return "Top to bottom";
    case "LR":
      return "Left to right";
    case "BT":
      return "Bottom to top";
    case "RL":
      return "Right to left";
    default:
      return direction;
  }
}

async function checkForFlowTests(configService: ConfigService) {
  const hasFlowTests = await hasFlowTestFiles(configService);
  vscode.commands.executeCommand(
    "setContext",
    "workspaceHasFlowTests",
    hasFlowTests
  );
}

async function hasFlowTestFiles(
  configService: ConfigService
): Promise<boolean> {
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

    const searchDirectories = await resolveCandidateDirectories(
      config,
      workspacePath
    );
    if (searchDirectories.length === 0) {
      continue;
    }

    const patterns = normalizeGlobList(
      config.discovery?.patterns ?? ["**/*.{yml,yaml}"]
    );
    const excludePatterns = normalizeGlobList(
      config.discovery?.exclude ?? ["**/node_modules/**"]
    );
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
    config.testDirectories && config.testDirectories.length > 0
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
    .map((value) => normalizeGlobPattern(value))
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
