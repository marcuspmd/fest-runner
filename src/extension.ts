import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { FlowTestProvider } from "./testProvider";
import { TestScanner } from "./testScanner";
import { TestRunner } from "./testRunner";
import { ConfigService } from "./services/configService";
import { HtmlResultsService } from "./services/htmlResultsService";
import { ImportExportService } from "./services/importExportService";
import { FlowTestConfig } from "./models/types";
import { TestMakerPanel } from "./ui/TestMakerPanel";
import { QaReportService } from "./services/qaReportService";
import { FlowTestIndex } from "./services/flowTestIndex";
import { FlowTestLanguageService } from "./services/flowTestLanguageService";
import { FlowTestCompletionProvider } from "./providers/flowTestCompletionProvider";
import { FlowTestHoverProvider } from "./providers/flowTestHoverProvider";
import { FlowTestCodeActionProvider } from "./providers/flowTestCodeActionProvider";
import { FlowTestEngineUpdateService } from "./services/flowTestEngineUpdateService";
import { FlowTestSchemaService } from "./services/flowTestSchemaService";

export function activate(context: vscode.ExtensionContext) {
  const testScanner = new TestScanner();
  const testRunner = new TestRunner();
  const testProvider = new FlowTestProvider(testScanner, testRunner);
  const configService = ConfigService.getInstance();
  const htmlResultsService = HtmlResultsService.getInstance();
  const importExportService = ImportExportService.getInstance();
  const qaReportService = QaReportService.getInstance();
  const engineUpdateService = new FlowTestEngineUpdateService(context);
  const flowTestIndex = new FlowTestIndex(testScanner);
  const schemaService = new FlowTestSchemaService(engineUpdateService);
  const languageService = new FlowTestLanguageService(
    flowTestIndex,
    schemaService
  );

  // Injetar TestRunner no HtmlResultsService para funcionalidade de rerun
  htmlResultsService.setTestRunner(testRunner);

  vscode.window.registerTreeDataProvider("flowTestExplorer", testProvider);

  const commands = [
    vscode.commands.registerCommand("flow-test-runner.openTestMaker", () => {
      TestMakerPanel.createOrShow(context.extensionUri, context);
    }),

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
      "flow-test-runner.retestQa",
      async () => {
        await testRunner.retestLast({
          reportFormats: ["qa"],
          description: "Retesting last execution with QA report",
        });
        const state = testRunner.getLastExecutionState();
        if (state) {
          try {
            await qaReportService.generateFromExecutionState(state);
          } catch {
            // Error already handled inside the service.
          }
        }
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.generateQaReport",
      async () => {
        const workspaceFolder = await selectWorkspaceFolder();
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        try {
          await qaReportService.generateHtmlReportForWorkspace(
            workspaceFolder.uri.fsPath
          );
        } catch {
          // Errors are reported within the service.
        }
      }
    ),

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

    vscode.commands.registerCommand(
      "flow-test-runner.importSwagger",
      async () => {
        await handleImportSwagger(importExportService, configService);
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.importPostman",
      async () => {
        await handleImportPostman(importExportService, configService);
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.importCurl",
      async () => {
        await handleImportCurl(importExportService, configService);
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.exportPostman",
      async (item) => {
        await handleExportPostman(
          importExportService,
          configService,
          item,
          false
        );
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.exportPostmanFromResults",
      async () => {
        await handleExportPostman(
          importExportService,
          configService,
          undefined,
          true
        );
      }
    ),

    vscode.commands.registerCommand("flow-test-runner.rerunLast", async () => {
      await testRunner.retestLast();
    }),

    vscode.commands.registerCommand("flow-test-runner.rerunCache", async () => {
      await testRunner.retestLast();
    }),

    vscode.commands.registerCommand("flow-test-runner.report", async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      await htmlResultsService.showResults(workspaceFolder.uri.fsPath);
    }),

    vscode.commands.registerCommand(
      "flow-test-runner.runSuiteWithJsonOutput",
      async (item) => {
        if (item && item.filePath && item.type === "suite") {
          await testRunner.runSuiteWithJsonOutput(item.filePath);
        }
      }
    ),

    vscode.commands.registerCommand(
      "flow-test-runner.updateInterfaces",
      async () => {
        const workspaceFolder = await selectWorkspaceFolder();
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }
        const config = vscode.workspace.getConfiguration(
          "flowTestRunner",
          workspaceFolder.uri
        );
        const command = config.get<string>("command", "flow-test-engine");
        try {
          await engineUpdateService.updateInterfaces(
            command,
            workspaceFolder.uri.fsPath
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(
            `Falha ao atualizar interfaces do Flow Test Engine: ${message}`
          );
        }
      }
    ),
  ];

  void (async () => {
    await ensureEngineSchema(configService, engineUpdateService);
    await schemaService.initialize();
  })();

  context.subscriptions.push(
    ...commands,
    testScanner,
    testRunner,
    htmlResultsService,
    importExportService,
    qaReportService,
    flowTestIndex,
    engineUpdateService,
    schemaService,
    vscode.languages.registerCompletionItemProvider(
      [
        { language: "yaml", scheme: "file", pattern: "**/*.yml" },
        { language: "yaml", scheme: "file", pattern: "**/*.yaml" },
      ],
      new FlowTestCompletionProvider(languageService),
      " ",
      ":",
      '"',
      "'",
      "-"
    ),
    vscode.languages.registerHoverProvider(
      [
        { language: "yaml", scheme: "file", pattern: "**/*.yml" },
        { language: "yaml", scheme: "file", pattern: "**/*.yaml" },
      ],
      new FlowTestHoverProvider(languageService)
    ),
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "yaml", scheme: "file", pattern: "**/*.yml" },
        { language: "yaml", scheme: "file", pattern: "**/*.yaml" },
      ],
      new FlowTestCodeActionProvider(languageService),
      {
        providedCodeActionKinds:
          FlowTestCodeActionProvider.providedCodeActionKinds,
      }
    )
  );

  checkForFlowTests(configService);
  void engineUpdateService.checkForUpdates();
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
    title: "Select workspace",
    placeHolder: "Workspace folder",
    ignoreFocusOut: true,
  });

  return pick?.folder;
}

async function checkForFlowTests(configService: ConfigService) {
  const hasFlowTests = await hasFlowTestFiles(configService);
  vscode.commands.executeCommand(
    "setContext",
    "workspaceHasFlowTests",
    hasFlowTests
  );
}

async function ensureEngineSchema(
  configService: ConfigService,
  engineUpdateService: FlowTestEngineUpdateService
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  for (const folder of folders) {
    try {
      const config = await configService.getConfig(folder.uri.fsPath);
      const command = config.command ?? "flow-test-engine";
      await engineUpdateService.ensureLatestSchema(command, folder.uri.fsPath, {
        silent: true,
        versionHint: undefined,
      });
    } catch (error) {
      console.warn(
        `Failed to synchronize Flow Test Engine schema for ${folder.uri.fsPath}:`,
        error
      );
    }
  }
}

async function hasFlowTestFiles(
  configService: ConfigService
): Promise<boolean> {
  if (!vscode.workspace.workspaceFolders) {
    return false;
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const workspacePath = workspaceFolder.uri.fsPath;

    // Verificar se existe arquivo de config antes de fazer qualquer varredura
    const hasConfig = await configService.hasConfigFile(workspacePath);
    if (!hasConfig) {
      continue;
    }

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

async function handleImportSwagger(
  importExportService: ImportExportService,
  configService: ConfigService
): Promise<void> {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  const inputUri = await vscode.window.showOpenDialog({
    title: "Select Swagger/OpenAPI file",
    openLabel: "Import",
    canSelectMany: false,
    filters: {
      JSON: ["json"],
      YAML: ["yaml", "yml"],
      All: ["*"],
    },
  });

  if (!inputUri || inputUri.length === 0) {
    return;
  }

  const defaultOutputDir = path.join(workspacePath, "tests", "imported");

  const outputUri = await vscode.window.showSaveDialog({
    title: "Select output directory",
    saveLabel: "Import Here",
    defaultUri: vscode.Uri.file(defaultOutputDir),
  });

  if (!outputUri) {
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Importing Swagger/OpenAPI...",
      },
      async () => {
        return importExportService.importSwagger({
          workspacePath,
          inputPath: inputUri[0].fsPath,
          outputPath: outputUri.fsPath,
          type: "swagger",
        });
      }
    );

    const relativeOutput = path.relative(workspacePath, result.outputPath);
    const outputDisplay =
      relativeOutput && !relativeOutput.startsWith("..")
        ? relativeOutput
        : result.outputPath;

    const openOption = "Open Folder";
    const revealOption = "Reveal";

    const action = await vscode.window.showInformationMessage(
      `Swagger tests imported to ${outputDisplay}`,
      openOption,
      revealOption
    );

    if (action === openOption) {
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(result.outputPath),
        { forceNewWindow: false }
      );
    } else if (action === revealOption) {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(result.outputPath)
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to import Swagger: ${message}`);
  }
}

async function handleImportPostman(
  importExportService: ImportExportService,
  configService: ConfigService
): Promise<void> {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  const inputUri = await vscode.window.showOpenDialog({
    title: "Select Postman collection file",
    openLabel: "Import",
    canSelectMany: false,
    filters: {
      JSON: ["json"],
      All: ["*"],
    },
  });

  if (!inputUri || inputUri.length === 0) {
    return;
  }

  const defaultOutputDir = path.join(
    workspacePath,
    "tests",
    "imported-postman"
  );

  const outputUri = await vscode.window.showSaveDialog({
    title: "Select output directory",
    saveLabel: "Import Here",
    defaultUri: vscode.Uri.file(defaultOutputDir),
  });

  if (!outputUri) {
    return;
  }

  const preserveFoldersItems = [
    {
      label: "Yes",
      description: "Preserve Postman folder structure",
      value: true,
    },
    {
      label: "No",
      description: "Flatten structure",
      value: false,
    },
  ];

  const preserveFoldersSelection = await vscode.window.showQuickPick(
    preserveFoldersItems,
    {
      title: "Preserve Folder Structure?",
      placeHolder: "Maintain Postman collection folder hierarchy",
      ignoreFocusOut: true,
    }
  );

  if (!preserveFoldersSelection) {
    return;
  }

  const analyzeDepsItems = [
    {
      label: "Yes",
      description: "Analyze request dependencies",
      value: true,
    },
    {
      label: "No",
      description: "Skip dependency analysis",
      value: false,
    },
  ];

  const analyzeDepsSelection = await vscode.window.showQuickPick(
    analyzeDepsItems,
    {
      title: "Analyze Dependencies?",
      placeHolder: "Detect and map request dependencies",
      ignoreFocusOut: true,
    }
  );

  if (!analyzeDepsSelection) {
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Importing Postman collection...",
      },
      async () => {
        return importExportService.importPostman({
          workspacePath,
          inputPath: inputUri[0].fsPath,
          outputPath: outputUri.fsPath,
          type: "postman",
          preserveFolders: preserveFoldersSelection.value,
          analyzeDeps: analyzeDepsSelection.value,
        });
      }
    );

    const relativeOutput = path.relative(workspacePath, result.outputPath);
    const outputDisplay =
      relativeOutput && !relativeOutput.startsWith("..")
        ? relativeOutput
        : result.outputPath;

    const openOption = "Open Folder";
    const revealOption = "Reveal";

    const action = await vscode.window.showInformationMessage(
      `Postman tests imported to ${outputDisplay}`,
      openOption,
      revealOption
    );

    if (action === openOption) {
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(result.outputPath),
        { forceNewWindow: false }
      );
    } else if (action === revealOption) {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(result.outputPath)
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to import Postman collection: ${message}`
    );
  }
}

async function handleExportPostman(
  importExportService: ImportExportService,
  _configService: ConfigService,
  item: any,
  fromResults: boolean
): Promise<void> {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  let inputPath: string;

  if (fromResults) {
    const resultsPath = path.join(workspacePath, "results", "latest.json");

    if (!(await fileExists(resultsPath))) {
      vscode.window.showErrorMessage("No test results found. Run tests first.");
      return;
    }

    inputPath = resultsPath;
  } else {
    let defaultInputPath: string | undefined;

    if (item?.filePath) {
      defaultInputPath = item.filePath;
    }

    const inputUri = await vscode.window.showOpenDialog({
      title: "Select Flow Test file or directory to export",
      openLabel: "Export",
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: true,
      defaultUri: defaultInputPath
        ? vscode.Uri.file(defaultInputPath)
        : undefined,
      filters: {
        YAML: ["yaml", "yml"],
        All: ["*"],
      },
    });

    if (!inputUri || inputUri.length === 0) {
      return;
    }

    inputPath = inputUri[0].fsPath;
  }

  const defaultOutputName = fromResults
    ? "exported-results.postman_collection.json"
    : "exported.postman_collection.json";

  const defaultOutputPath = path.join(workspacePath, defaultOutputName);

  const outputUri = await vscode.window.showSaveDialog({
    title: "Save Postman collection",
    saveLabel: "Export",
    defaultUri: vscode.Uri.file(defaultOutputPath),
    filters: {
      JSON: ["json"],
    },
  });

  if (!outputUri) {
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Exporting to Postman...",
      },
      async () => {
        return importExportService.exportPostman({
          workspacePath,
          inputPath,
          outputPath: outputUri.fsPath,
          fromResults,
        });
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
      `Postman collection exported to ${outputDisplay}`,
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
    vscode.window.showErrorMessage(`Failed to export to Postman: ${message}`);
  }
}

async function handleImportCurl(
  importExportService: ImportExportService,
  configService: ConfigService
): Promise<void> {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;

  const curlCommand = await vscode.window.showInputBox({
    title: "Import/Execute cURL Command",
    prompt: "Paste your cURL command here",
    placeHolder: "curl -X GET https://api.example.com/endpoint",
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "cURL command cannot be empty";
      }
      if (!value.trim().toLowerCase().startsWith("curl")) {
        return "Command must start with 'curl'";
      }
      return null;
    },
  });

  if (!curlCommand) {
    return;
  }

  const actionItems = [
    {
      label: "Execute and Convert",
      description: "Run the cURL command and convert response to Flow Test",
      value: true,
    },
    {
      label: "Convert Only",
      description: "Convert cURL to Flow Test without executing",
      value: false,
    },
  ];

  const actionSelection = await vscode.window.showQuickPick(actionItems, {
    title: "Choose Action",
    placeHolder: "What would you like to do with this cURL command?",
    ignoreFocusOut: true,
  });

  if (!actionSelection) {
    return;
  }

  const execute = actionSelection.value;

  let outputPath: string | undefined;

  const shouldSaveItems = [
    {
      label: "Yes",
      description: "Save to a test file",
      value: true,
    },
    {
      label: "No",
      description: "Just show the result",
      value: false,
    },
  ];

  const shouldSave = await vscode.window.showQuickPick(shouldSaveItems, {
    title: "Save Test File?",
    placeHolder: "Would you like to save this as a test file?",
    ignoreFocusOut: true,
  });

  if (!shouldSave) {
    return;
  }

  if (shouldSave.value) {
    const defaultOutputPath = path.join(
      workspacePath,
      "tests",
      "imported",
      "curl-test.yaml"
    );

    const outputUri = await vscode.window.showSaveDialog({
      title: "Save Flow Test file",
      saveLabel: "Save",
      defaultUri: vscode.Uri.file(defaultOutputPath),
      filters: {
        YAML: ["yaml", "yml"],
      },
    });

    if (!outputUri) {
      return;
    }

    outputPath = outputUri.fsPath;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: execute ? "Executing cURL and converting..." : "Converting cURL...",
      },
      async () => {
        return importExportService.importCurl({
          workspacePath,
          curlCommand,
          outputPath,
          execute,
        });
      }
    );

    let message: string;
    if (result.outputPath) {
      const relativeOutput = path.relative(workspacePath, result.outputPath);
      const outputDisplay =
        relativeOutput && !relativeOutput.startsWith("..")
          ? relativeOutput
          : result.outputPath;

      message = execute
        ? `cURL executed and saved to ${outputDisplay}`
        : `cURL converted and saved to ${outputDisplay}`;
    } else {
      message = execute
        ? "cURL executed successfully. Check Output panel for results."
        : "cURL converted successfully. Check Output panel for results.";
    }

    const openOption = result.outputPath ? "Open File" : undefined;
    const outputOption = "View Output";

    const options = [outputOption];
    if (openOption) {
      options.unshift(openOption);
    }

    const action = await vscode.window.showInformationMessage(
      message,
      ...options
    );

    if (action === openOption && result.outputPath) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(result.outputPath)
      );
      await vscode.window.showTextDocument(document, {
        preview: false,
      });
    } else if (action === outputOption) {
      vscode.commands.executeCommand("workbench.action.output.show");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to import cURL: ${message}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function deactivate() {}
