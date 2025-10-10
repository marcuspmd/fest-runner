import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  TestResult,
  FlowTestConfig,
  TestExecutionState,
  UserInputRequest,
  TestStatus,
  SuiteResult,
} from "./models/types";
import * as yaml from "yaml";
import { ConfigService } from "./services/configService";
import { InputService } from "./services/inputService";
import { quoteArgsForShell } from "./utils/commandLine";

interface NormalizedInputOption {
  label: string;
  value: string;
  index: number;
}

interface NormalizedInputConfig {
  stepKey: string;
  stepLabel: string;
  variable: string;
  prompt: string;
  type: string;
  required: boolean;
  masked: boolean;
  defaultValue?: string;
  options?: NormalizedInputOption[];
}

const FLOW_INPUT_EVENT_PREFIX = "@@FLOW_INPUT@@";
const FLOW_INPUT_FLAG = "--runner-interactive-inputs";

interface TestRunOptions {
  useCachedInputs?: boolean;
}

interface FlowInputOptionPayload {
  label?: string;
  value?: string;
  description?: string;
}

interface FlowInputRequestPayload {
  request_id?: string;
  suite_name?: string;
  suite_path?: string;
  step_name?: string;
  step_id?: string;
  step_index?: number;
  cache_key?: string;
  variable: string;
  prompt?: string;
  required?: boolean;
  masked?: boolean;
  input_type?: string;
  default?: any;
  options?: FlowInputOptionPayload[];
}

interface FlowInputEventPayload {
  type?: string;
  request?: FlowInputRequestPayload;
  message?: string;
}

interface InteractiveInputContext {
  process: ChildProcess;
  config: FlowTestConfig;
  suitePath?: string;
  stepName?: string;
  stepId?: string;
  collectedInputs: Record<string, string>;
  useCache: boolean;
  suppressNotifications: boolean;
}

export class TestRunner {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private outputChannel: vscode.OutputChannel;
  private configService: ConfigService;
  private inputService: InputService;
  private lastExecutionState: TestExecutionState | null = null;

  private _onTestResult: vscode.EventEmitter<TestResult> =
    new vscode.EventEmitter<TestResult>();
  readonly onTestResult: vscode.Event<TestResult> = this._onTestResult.event;

  private _onSuiteResult: vscode.EventEmitter<SuiteResult> =
    new vscode.EventEmitter<SuiteResult>();
  readonly onSuiteResult: vscode.Event<SuiteResult> = this._onSuiteResult.event;

  private _onUserInputRequired: vscode.EventEmitter<UserInputRequest> =
    new vscode.EventEmitter<UserInputRequest>();
  readonly onUserInputRequired: vscode.Event<UserInputRequest> =
    this._onUserInputRequired.event;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Flow Test Runner");
    this.configService = ConfigService.getInstance();
    this.inputService = InputService.getInstance();
  }

  private shouldUseInteractiveInputs(config: FlowTestConfig): boolean {
    return config.interactiveInputs !== false;
  }

  async runSuite(suitePath: string, options?: TestRunOptions): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(suitePath)
    );
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    const config = await this.configService.getConfig(
      workspaceFolder.uri.fsPath
    );
    const cwd = config.workingDirectory || workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);
    const useCachedInputs = options?.useCachedInputs === true;

    this.outputChannel.show();
    this.outputChannel.appendLine(
      `🚀 Running Flow Test Suite: ${relativePath}`
    );
    this.outputChannel.appendLine(`🔧 Using command: ${config.command}`);
    this.outputChannel.appendLine(
      `📄 Config file: ${config.configFile || "default settings"}`
    );
    this.outputChannel.appendLine("=".repeat(50));

    try {
      await this.executeTest(
        suitePath,
        cwd,
        relativePath,
        undefined,
        undefined,
        config,
        { useCachedInputs }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to run test: ${errorMessage}`);
      throw error;
    }
  }

  async runAll(workspacePath: string, options?: TestRunOptions): Promise<void> {
    const config = await this.configService.getConfig(workspacePath);
    const cwd = config.workingDirectory || workspacePath;
    const useInteractiveInputs = this.shouldUseInteractiveInputs(config);
    const useCachedInputs = options?.useCachedInputs === true;

    this.outputChannel.show();
    this.outputChannel.appendLine("🚀 Running all Flow Test suites");
    this.outputChannel.appendLine(`🔧 Using command: ${config.command}`);
    this.outputChannel.appendLine(`📁 Working directory: ${cwd}`);
    this.outputChannel.appendLine(
      `📄 Config file: ${config.configFile || "default settings"}`
    );
    this.outputChannel.appendLine("=".repeat(50));

    await this.executeRun({
      args: [],
      cwd,
      config,
      processKey: `${cwd}-all-suites`,
      fallbackSuiteName: undefined,
      successMessage: "✅ All Flow Tests completed successfully",
      failureMessage: "❌ Flow Test execution failed",
      useInteractiveInputs,
      useCachedInputs,
      collectedInputs: {},
    });
  }

  async runStep(
    suitePath: string,
    stepName: string,
    stepId: string,
    options?: TestRunOptions
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(suitePath)
    );
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found");
      return;
    }

    const config = await this.configService.getConfig(
      workspaceFolder.uri.fsPath
    );
    const cwd = config.workingDirectory || workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);
    const useCachedInputs = options?.useCachedInputs === true;

    this.outputChannel.show();
    this.outputChannel.appendLine(
      `🎯 Running Flow Test Step: ${stepName} in ${relativePath}`
    );
    this.outputChannel.appendLine(`🆔 Step ID: ${stepId}`);
    this.outputChannel.appendLine(`🔧 Using command: ${config.command}`);
    this.outputChannel.appendLine(
      `📄 Config file: ${config.configFile || "default settings"}`
    );
    this.outputChannel.appendLine("=".repeat(50));

    try {
      await this.executeTest(
        suitePath,
        cwd,
        relativePath,
        stepName,
        stepId,
        config,
        { useCachedInputs }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(
        `Failed to run test step: ${errorMessage}`
      );
      throw error;
    }
  }

  private async executeTest(
    suitePath: string,
    cwd: string,
    relativePath: string,
    stepName?: string,
    stepId?: string,
    config?: FlowTestConfig,
    runOptions?: TestRunOptions
  ): Promise<void> {
    let finalConfig: FlowTestConfig;
    if (!config) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(suitePath)
      );
      if (!workspaceFolder) {
        throw new Error("No workspace folder found");
      }
      finalConfig = await this.configService.getConfig(
        workspaceFolder.uri.fsPath
      );
    } else {
      finalConfig = config;
    }

    const useInteractiveInputs = this.shouldUseInteractiveInputs(finalConfig);
    const useCachedInputs = runOptions?.useCachedInputs === true;

    const collectedInputs: Record<string, string> = {};
    let preparedInputs: {
      submissions: string[];
      userInputs: Record<string, string>;
    } = {
      submissions: [],
      userInputs: collectedInputs,
    };

    if (!useInteractiveInputs) {
      try {
        preparedInputs = await this.prepareInteractiveInputs(
          suitePath,
          stepId,
          {
            useCache: useCachedInputs,
            suppressNotifications: useCachedInputs,
          }
        );
        Object.assign(collectedInputs, preparedInputs.userInputs);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(
          `❌ Failed to prepare test inputs: ${errorMessage}`
        );
        vscode.window.showErrorMessage(
          `Falha ao coletar inputs necessários: ${errorMessage}`
        );
        throw error;
      }
    }

    this.lastExecutionState = {
      suitePath,
      stepName,
      stepId,
      config: finalConfig,
      userInputs:
        Object.keys(collectedInputs).length > 0 ? collectedInputs : undefined,
      timestamp: Date.now(),
    };

    if (!useInteractiveInputs && Object.keys(collectedInputs).length > 0) {
      this.outputChannel.appendLine(
        `🧩 Inputs coletados: ${Object.keys(collectedInputs).length}`
      );
    }

    await this.executeRun({
      args: [relativePath],
      cwd,
      config: finalConfig,
      processKey: `${suitePath}-${stepId || stepName || "all"}`,
      fallbackSuiteName: path.basename(suitePath),
      stepName,
      stepId,
      suitePath,
      preparedInputs,
      useInteractiveInputs,
      useCachedInputs,
      collectedInputs,
      successMessage: "✅ Test completed successfully",
      failureMessage: "❌ Test execution failed",
    });
  }

  private async executeRun(options: {
    args: string[];
    cwd: string;
    config: FlowTestConfig;
    processKey: string;
    fallbackSuiteName?: string;
    stepName?: string;
    stepId?: string;
    suitePath?: string;
    preparedInputs?: {
      submissions: string[];
      userInputs: Record<string, string>;
    };
    useInteractiveInputs?: boolean;
    useCachedInputs?: boolean;
    collectedInputs?: Record<string, string>;
    successMessage?: string;
    failureMessage?: string;
  }): Promise<void> {
    const {
      args,
      cwd,
      config,
      processKey,
      fallbackSuiteName,
      stepName,
      stepId,
      suitePath,
      preparedInputs = { submissions: [], userInputs: {} },
      useInteractiveInputs = false,
      useCachedInputs = false,
      collectedInputs,
      successMessage,
      failureMessage,
    } = options;

    const fallbackSuiteLabel =
      fallbackSuiteName ?? (suitePath ? path.basename(suitePath) : undefined);

    return new Promise((resolve, reject) => {
      if (this.runningProcesses.has(processKey)) {
        vscode.window.showWarningMessage("Test is already running");
        resolve();
        return;
      }

      const finalArgs = [...args];
      const liveEventsPath = this.prepareLiveEventsFile(cwd);
      finalArgs.push("--live-events", liveEventsPath);

      if (stepId) {
        finalArgs.push("--step", stepId);
      }

      if (useInteractiveInputs) {
        finalArgs.push(FLOW_INPUT_FLAG);
      }

      if (config.outputFormat === "html" || config.outputFormat === "both") {
        finalArgs.push("--html-output");
      }

      const preparedArgs = quoteArgsForShell(finalArgs);
      const commandLine = [config.command, ...preparedArgs].join(" ").trim();
      this.outputChannel.appendLine(`📋 Executing command: ${commandLine}`);
      this.outputChannel.appendLine(`📁 Working directory: ${cwd}`);
      this.outputChannel.appendLine(
        `⚙️  Configuration: ${JSON.stringify(config, null, 2)}`
      );
      this.outputChannel.appendLine("");

      const testProcess = spawn(config.command, preparedArgs, {
        cwd,
        shell: true,
        timeout: config.timeout,
      });

      this.runningProcesses.set(processKey, testProcess);

      if (!useInteractiveInputs && preparedInputs.submissions.length > 0) {
        preparedInputs.submissions.forEach((submission) => {
          testProcess.stdin?.write(`${submission}\n`);
        });
      }

      let output = "";
      let errorOutput = "";

      const interactiveCollectedInputs =
        collectedInputs ?? preparedInputs.userInputs ?? {};

      const interactiveContext: InteractiveInputContext | undefined =
        useInteractiveInputs
          ? {
              process: testProcess,
              config,
              suitePath,
              stepName,
              stepId,
              collectedInputs: interactiveCollectedInputs,
              useCache: useCachedInputs,
              suppressNotifications: useCachedInputs,
            }
          : undefined;

      const interactiveController = interactiveContext
        ? this.createInteractiveInputController(interactiveContext)
        : undefined;

      testProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        if (interactiveController) {
          const forwarded = interactiveController.handleData(text);
          if (forwarded) {
            output += forwarded;
            this.outputChannel.append(forwarded);
          }
        } else {
          output += text;
          this.outputChannel.append(text);
        }
      });

      testProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        this.outputChannel.append(`[ERROR] ${text}`);
      });

      testProcess.on("close", async (code) => {
        this.runningProcesses.delete(processKey);

        if (interactiveController) {
          const remaining = interactiveController.flush();
          if (remaining) {
            output += remaining;
            this.outputChannel.append(remaining);
          }

          try {
            await interactiveController.waitForCompletion();
          } catch (interactiveError) {
            const message =
              interactiveError instanceof Error
                ? interactiveError.message
                : String(interactiveError);
            this.outputChannel.appendLine(
              `❌ Erro ao processar inputs interativos: ${message}`
            );
          }
        }

        const suiteLabel = fallbackSuiteLabel;

        let dispatched = false;
        let hadFailures = false;
        try {
          const liveResult = await this.processLiveEvents(
            liveEventsPath,
            suiteLabel,
            stepName
          );
          dispatched = liveResult.dispatched;
          hadFailures = liveResult.hadFailures;
        } catch (error) {
          console.warn("Failed to process Flow Test live events:", error);
        }

        if (!dispatched && output.trim()) {
          const parsedResult = this.parseTestResults(
            output,
            suiteLabel,
            stepName
          );
          dispatched = parsedResult.dispatched;
          hadFailures = hadFailures || parsedResult.hadFailures;
        }

        const aggregatedResult = await this.loadAggregatedResult(config, cwd);
        this.emitSuiteResults(aggregatedResult, suiteLabel);
        const exitCode = code ?? 0;
        const shouldTreatAsSuccess = this.shouldTreatExitAsSuccess(
          exitCode,
          hadFailures,
          aggregatedResult
        );

        if (
          interactiveContext &&
          this.lastExecutionState &&
          suitePath &&
          this.lastExecutionState.suitePath === suitePath
        ) {
          const keys = Object.keys(interactiveCollectedInputs);
          this.lastExecutionState.userInputs =
            keys.length > 0 ? interactiveCollectedInputs : undefined;
        }

        if (stepName && !dispatched && suiteLabel) {
          const fallbackResult = {
            suite: suiteLabel,
            step: stepName,
            status: shouldTreatAsSuccess
              ? "passed"
              : ("failed" as "passed" | "failed"),
            error: shouldTreatAsSuccess
              ? undefined
              : errorOutput || `Exited with code ${exitCode}`,
          };
          this._onTestResult.fire(fallbackResult);
          dispatched = true;
          hadFailures = hadFailures || fallbackResult.status === "failed";
        }

        if (shouldTreatAsSuccess) {
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            successMessage || "✅ Test completed successfully"
          );
          resolve();
        } else {
          this.outputChannel.appendLine("");
          this.outputChannel.appendLine(
            `${
              failureMessage || "❌ Test execution failed"
            } (exit code ${exitCode})`
          );
          if (errorOutput) {
            this.outputChannel.appendLine(`Error output: ${errorOutput}`);
          }
          reject(new Error(`Test failed with exit code ${exitCode}`));
        }
      });

      testProcess.on("error", (error) => {
        this.runningProcesses.delete(processKey);
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
          `❌ Failed to start test: ${error.message}`
        );
        if (stepName) {
          this._onTestResult.fire({
            suite: fallbackSuiteLabel ?? "unknown-suite",
            step: stepName,
            status: "failed",
            error: error.message,
          });
        }
        reject(error);
      });
    });
  }

  private normalizeStoredValue(
    config: NormalizedInputConfig,
    rawValue: string
  ): string {
    if (config.type === "confirm") {
      return rawValue === "y" ? "true" : "false";
    }

    return rawValue;
  }

  private toSubmissionValue(
    config: NormalizedInputConfig,
    rawValue: string
  ): string {
    switch (config.type) {
      case "select":
        if (rawValue !== undefined) {
          return String(rawValue);
        }
        if (config.defaultValue !== undefined) {
          return String(config.defaultValue);
        }
        return "";
      case "confirm":
        if (rawValue === "y" || rawValue === "n") {
          return rawValue;
        }
        return rawValue.toLowerCase().startsWith("y") ? "y" : "n";
      default:
        return rawValue ?? "";
    }
  }

  private normalizeStepInputs(
    step: any,
    suitePath: string
  ): NormalizedInputConfig[] {
    if (!step || !step.input) {
      return [];
    }

    const rawInputs = Array.isArray(step.input) ? step.input : [step.input];

    return rawInputs.map((rawInput: any, index: number) => {
      const variable = String(
        rawInput?.variable ?? rawInput?.name ?? `input_${index + 1}`
      );
      const type = String(
        rawInput?.type ?? (rawInput?.masked ? "password" : "text")
      ).toLowerCase();
      const required = rawInput?.required !== false;
      const masked = rawInput?.masked === true || type === "password";
      const prompt = String(
        rawInput?.prompt ??
          rawInput?.label ??
          `Informe o valor para ${variable}`
      );

      const defaultValueRaw =
        rawInput?.default ?? rawInput?.default_value ?? rawInput?.ci_default;
      let defaultValue: string | undefined;
      if (defaultValueRaw !== undefined && defaultValueRaw !== null) {
        if (type === "confirm") {
          defaultValue = defaultValueRaw ? "y" : "n";
        } else {
          defaultValue = String(defaultValueRaw);
        }
      }

      let options: NormalizedInputOption[] | undefined;
      if (Array.isArray(rawInput?.options)) {
        options = rawInput.options.map((option: any, optionIndex: number) => {
          if (typeof option === "string") {
            return {
              label: option,
              value: option,
              index: optionIndex,
            };
          }

          const optionLabel =
            option.label ??
            option.text ??
            option.name ??
            option.value ??
            `Opção ${optionIndex + 1}`;
          const optionValue = option.value ?? optionLabel;

          return {
            label: String(optionLabel),
            value: String(optionValue),
            index: optionIndex,
          };
        });
      }

      return {
        stepKey: `${path.basename(suitePath)}::${
          step.step_id ?? step.name ?? `step-${index + 1}`
        }`,
        stepLabel: String(step.name ?? step.step_id ?? `Step ${index + 1}`),
        variable,
        prompt,
        type,
        required,
        masked,
        defaultValue,
        options,
      };
    });
  }

  private createInteractiveInputController(context: InteractiveInputContext): {
    handleData: (chunk: string) => string;
    flush: () => string;
    waitForCompletion: () => Promise<void>;
  } {
    let buffer = "";
    let queue: Promise<void> = Promise.resolve();
    let lastError: Error | undefined;

    const enqueueRequest = (payload: FlowInputRequestPayload) => {
      queue = queue
        .then(async () => {
          await this.processInteractiveInputRequest(payload, context);
        })
        .catch((error) => {
          lastError = error instanceof Error ? error : new Error(String(error));
        });
    };

    const handleEvent = (event: FlowInputEventPayload) => {
      if (!event || !event.type) {
        return;
      }

      const type = event.type.toLowerCase();
      if (type === "request" && event.request) {
        enqueueRequest(event.request);
        return;
      }

      if (type === "info" && event.message) {
        this.outputChannel.appendLine(event.message);
      }
    };

    const processLine = (lineContent: string, originalLine: string): string => {
      const trimmed = lineContent.trim();
      if (!trimmed.startsWith(FLOW_INPUT_EVENT_PREFIX)) {
        return originalLine;
      }

      const payloadText = trimmed.slice(FLOW_INPUT_EVENT_PREFIX.length).trim();

      if (!payloadText) {
        return "";
      }

      try {
        const event = JSON.parse(payloadText) as FlowInputEventPayload;
        handleEvent(event);
        return "";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outputChannel.appendLine(
          `⚠️ Não foi possível interpretar evento interativo: ${message}`
        );
        return originalLine;
      }
    };

    const handleData = (chunk: string): string => {
      buffer += chunk;
      let forwarded = "";
      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const lineWithNewline = buffer.slice(0, newlineIndex + 1);
        buffer = buffer.slice(newlineIndex + 1);
        const lineWithoutNewline = lineWithNewline.replace(/\r?\n$/, "");
        forwarded += processLine(lineWithoutNewline, lineWithNewline);
        newlineIndex = buffer.indexOf("\n");
      }

      return forwarded;
    };

    const flush = (): string => {
      if (!buffer) {
        return "";
      }

      const remaining = buffer;
      buffer = "";
      return processLine(remaining, remaining);
    };

    const waitForCompletion = async (): Promise<void> => {
      await queue;
      if (lastError) {
        throw lastError;
      }
    };

    return { handleData, flush, waitForCompletion };
  }

  private buildInteractiveStepKey(
    payload: FlowInputRequestPayload,
    context: InteractiveInputContext
  ): string {
    if (payload.cache_key && String(payload.cache_key).trim().length > 0) {
      return String(payload.cache_key).trim();
    }

    const suiteSource =
      payload.suite_path ??
      context.suitePath ??
      context.config.configFile ??
      context.config.workingDirectory ??
      "";
    const suiteLabel = suiteSource
      ? path.basename(suiteSource)
      : "flow-test-engine";

    const identifierCandidates = [
      payload.step_id,
      payload.step_name,
      context.stepId,
      context.stepName,
      typeof payload.step_index === "number"
        ? `step-${payload.step_index + 1}`
        : undefined,
      payload.variable,
    ];

    const identifier = identifierCandidates.find(
      (candidate) =>
        typeof candidate === "string" && candidate.trim().length > 0
    );

    return `${suiteLabel}::${identifier ?? "step"}`;
  }

  private mapInteractivePayloadToConfig(
    payload: FlowInputRequestPayload,
    stepKey: string
  ): NormalizedInputConfig {
    const type = (payload.input_type ?? "text").toString().toLowerCase();
    const masked = payload.masked === true || type === "password";
    const required = payload.required !== false;
    const variable = String(payload.variable);
    const prompt = payload.prompt
      ? String(payload.prompt)
      : `Informe o valor para ${variable}`;

    let defaultValue: string | undefined;
    if (payload.default !== undefined && payload.default !== null) {
      if (type === "confirm") {
        defaultValue = payload.default ? "y" : "n";
      } else {
        defaultValue = String(payload.default);
      }
    }

    let options: NormalizedInputOption[] | undefined;
    if (Array.isArray(payload.options) && payload.options.length > 0) {
      options = payload.options
        .map((option, index) => {
          if (!option) {
            return undefined;
          }
          const valueSource =
            option.value ??
            option.label ??
            option.description ??
            `option-${index + 1}`;
          const value = String(valueSource);
          const label = option.label ? String(option.label) : value;
          return {
            label,
            value,
            index,
          };
        })
        .filter((option): option is NormalizedInputOption => Boolean(option));
    }

    return {
      stepKey,
      stepLabel: String(
        payload.step_name ??
          payload.step_id ??
          `Step ${
            typeof payload.step_index === "number" ? payload.step_index + 1 : 1
          }`
      ),
      variable,
      prompt,
      type,
      required,
      masked,
      defaultValue,
      options,
    };
  }

  private async processInteractiveInputRequest(
    payload: FlowInputRequestPayload,
    context: InteractiveInputContext
  ): Promise<void> {
    if (!payload || payload.variable === undefined) {
      return;
    }

    const stepKey = this.buildInteractiveStepKey(payload, context);
    const config = this.mapInteractivePayloadToConfig(payload, stepKey);
    const request: UserInputRequest = {
      stepName: config.stepKey,
      inputName: config.variable,
      prompt: config.prompt,
      required: config.required,
      masked: config.masked,
      type: config.type,
      options: config.options?.map((option) => ({
        label: option.label,
        value: option.value,
      })),
      defaultValue: config.defaultValue,
    };

    let rawValue: string | undefined;

    try {
      rawValue = await this.handleInteractiveInput(request, {
        useCache: context.useCache,
        suppressNotifications: context.suppressNotifications,
      });
    } catch (error) {
      context.process.kill();
      throw error;
    }

    if (rawValue === undefined) {
      if (config.defaultValue !== undefined) {
        context.collectedInputs[payload.variable] = this.normalizeStoredValue(
          config,
          config.defaultValue
        );
        this.inputService.setCachedInput(
          request.stepName,
          request.inputName,
          config.defaultValue
        );
        context.process.stdin?.write(
          `${this.toSubmissionValue(config, config.defaultValue)}\n`
        );
        return;
      }

      if (!config.required) {
        if (config.type === "confirm") {
          context.collectedInputs[payload.variable] = this.normalizeStoredValue(
            config,
            "n"
          );
          this.inputService.setCachedInput(
            request.stepName,
            request.inputName,
            "n"
          );
          context.process.stdin?.write("\n");
        } else {
          context.collectedInputs[payload.variable] = "";
          this.inputService.setCachedInput(
            request.stepName,
            request.inputName,
            ""
          );
          context.process.stdin?.write("\n");
        }
        return;
      }

      throw new Error(`Input obrigatório cancelado: ${request.inputName}`);
    }

    const submissionValue = this.toSubmissionValue(config, rawValue);
    const storedValue = this.normalizeStoredValue(config, rawValue);
    context.collectedInputs[payload.variable] = storedValue;
    this.inputService.setCachedInput(
      request.stepName,
      request.inputName,
      storedValue
    );
    context.process.stdin?.write(`${submissionValue}\n`);
  }

  private async prepareInteractiveInputs(
    suitePath: string,
    stepId?: string,
    options?: {
      useCache?: boolean;
      suppressNotifications?: boolean;
    }
  ): Promise<{ submissions: string[]; userInputs: Record<string, string> }> {
    let suiteContent: string;
    try {
      suiteContent = await fs.promises.readFile(suitePath, "utf8");
    } catch (error) {
      throw new Error(`Não foi possível ler o arquivo do teste (${suitePath})`);
    }

    let parsed: any;
    try {
      parsed = yaml.parse(suiteContent);
    } catch (error) {
      throw new Error("Falha ao interpretar o arquivo YAML do teste");
    }

    const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
    if (steps.length === 0) {
      return { submissions: [], userInputs: {} };
    }

    const relevantSteps = stepId
      ? steps.filter(
          (step: any) => step.step_id === stepId || step.name === stepId
        )
      : steps;

    if (relevantSteps.length === 0) {
      return { submissions: [], userInputs: {} };
    }

    const useCache = options?.useCache ?? true;
    const suppressNotifications = options?.suppressNotifications ?? false;

    const submissions: string[] = [];
    const userInputs: Record<string, string> = {};

    for (const step of relevantSteps) {
      const inputs = this.normalizeStepInputs(step, suitePath);
      for (const input of inputs) {
        const request: UserInputRequest = {
          stepName: input.stepKey,
          inputName: input.variable,
          prompt: `${input.prompt} (Step: ${input.stepLabel})`,
          required: input.required,
          masked: input.masked,
          type: input.type,
          options: input.options?.map((option) => ({
            label: option.label,
            value: option.value,
          })),
          defaultValue: input.defaultValue,
        };

        const rawValue = await this.handleInteractiveInput(request, {
          useCache,
          suppressNotifications,
        });

        if (rawValue === undefined) {
          if (input.defaultValue !== undefined) {
            userInputs[input.variable] = this.normalizeStoredValue(
              input,
              input.defaultValue
            );
            submissions.push(
              this.toSubmissionValue(input, input.defaultValue)
            );
            continue;
          }

          if (!input.required) {
            if (
              input.type === "select" &&
              input.options &&
              input.options.length > 0
            ) {
              throw new Error(
                `Selecione um valor para '${input.variable}' para continuar a execução.`
              );
            }

            if (input.type === "confirm") {
              userInputs[input.variable] = this.normalizeStoredValue(
                input,
                "n"
              );
              submissions.push("");
            } else {
              userInputs[input.variable] = "";
              submissions.push("");
            }
            continue;
          }

          throw new Error(`Input obrigatório cancelado: ${input.variable}`);
        }

        userInputs[input.variable] = this.normalizeStoredValue(input, rawValue);
        submissions.push(this.toSubmissionValue(input, rawValue));
      }
    }

    return { submissions, userInputs };
  }

  private getReportOutputCandidates(
    config: FlowTestConfig,
    cwd: string
  ): string[] {
    const workingDir = config.workingDirectory || cwd;
    const candidates = new Set<string>();

    const resolvePath = (value: string | undefined) => {
      if (!value) {
        return undefined;
      }
      const normalized = path.isAbsolute(value)
        ? path.normalize(value)
        : path.normalize(path.resolve(workingDir, value));
      return normalized;
    };

    const reportingDir = resolvePath(config.reporting?.outputDir);
    if (reportingDir) {
      candidates.add(reportingDir);
    }

    candidates.add(path.normalize(path.join(workingDir, "results")));
    candidates.add(path.normalize(path.join(cwd, "results")));

    return Array.from(candidates);
  }

  private async loadAggregatedResult(
    config: FlowTestConfig,
    cwd: string
  ): Promise<any | null> {
    const candidates = this.getReportOutputCandidates(config, cwd);

    for (const dir of candidates) {
      const latestPath = path.join(dir, "latest.json");
      try {
        await fs.promises.access(latestPath, fs.constants.F_OK);
      } catch {
        continue;
      }

      try {
        const raw = await fs.promises.readFile(latestPath, "utf8");
        return JSON.parse(raw);
      } catch (error) {
        console.warn("Failed to parse Flow Test aggregated result:", error);
      }
    }

    return null;
  }

  private emitSuiteResults(
    aggregatedResult: any | null,
    fallbackSuiteLabel?: string
  ): void {
    if (!aggregatedResult) {
      return;
    }

    const suites = Array.isArray(aggregatedResult.suites_results)
      ? aggregatedResult.suites_results
      : [];

    if (suites.length === 0 && fallbackSuiteLabel) {
      const status: TestStatus =
        aggregatedResult.failed_tests && aggregatedResult.failed_tests > 0
          ? "failed"
          : "passed";
      this._onSuiteResult.fire({ suite: fallbackSuiteLabel, status });
    }

    for (const suite of suites) {
      const status = this.mapSuiteStatus(suite);
      const suiteLabel = this.resolveSuiteLabel(suite, fallbackSuiteLabel);
      this._onSuiteResult.fire({
        suite: suiteLabel,
        filePath:
          typeof suite.file_path === "string" ? suite.file_path : undefined,
        status,
      });
    }
  }

  private mapSuiteStatus(suite: any): TestStatus {
    const failedSteps =
      typeof suite?.steps_failed === "number" ? suite.steps_failed : 0;
    const suiteStatus =
      typeof suite?.status === "string"
        ? suite.status.toLowerCase()
        : undefined;

    if (suiteStatus === "failure" || failedSteps > 0) {
      return "failed";
    }

    return "passed";
  }

  private resolveSuiteLabel(suite: any, fallbackSuiteLabel?: string): string {
    const candidates = [
      suite?.suite_name,
      suite?.node_id,
      suite?.name,
      fallbackSuiteLabel,
      typeof suite?.file_path === "string"
        ? path.basename(suite.file_path)
        : undefined,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return "unknown-suite";
  }

  private shouldTreatExitAsSuccess(
    exitCode: number,
    hadFailures: boolean,
    aggregatedResult: any | null
  ): boolean {
    if (exitCode === 0) {
      return true;
    }

    if (hadFailures) {
      return false;
    }

    if (aggregatedResult) {
      if (typeof aggregatedResult.failed_tests === "number") {
        return aggregatedResult.failed_tests === 0;
      }

      const suites = Array.isArray(aggregatedResult.suites_results)
        ? aggregatedResult.suites_results
        : [];

      const suiteFailure = suites.some((suite: any) => {
        if (!suite) {
          return false;
        }
        if (suite.status && String(suite.status).toLowerCase() === "failure") {
          return true;
        }
        if (typeof suite.steps_failed === "number" && suite.steps_failed > 0) {
          return true;
        }
        return false;
      });

      if (!suiteFailure) {
        return true;
      }
    }

    return false;
  }

  private prepareLiveEventsFile(cwd: string): string {
    const eventsDir = path.join(cwd, ".fest-runner", "live-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const filePath = path.join(
      eventsDir,
      `run-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}.jsonl`
    );
    fs.writeFileSync(filePath, "", "utf8");
    return filePath;
  }

  private async processLiveEvents(
    liveEventsPath: string,
    fallbackSuiteName?: string,
    stepFilter?: string
  ): Promise<{ dispatched: boolean; hadFailures: boolean }> {
    try {
      await fs.promises.access(liveEventsPath, fs.constants.F_OK);
    } catch {
      return { dispatched: false, hadFailures: false };
    }

    const content = await fs.promises.readFile(liveEventsPath, "utf8");
    if (!content.trim()) {
      await fs.promises.unlink(liveEventsPath).catch(() => undefined);
      return { dispatched: false, hadFailures: false };
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    let dispatched = false;
    let hadFailures = false;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type !== "step_completed") {
          continue;
        }

        const payload = event.payload ?? {};
        const stepName = payload.step_name ?? "Unknown";
        const suiteLabel =
          (payload.suite_name && String(payload.suite_name)) ||
          fallbackSuiteName ||
          (payload.node_id && String(payload.node_id)) ||
          "unknown-suite";
        if (stepFilter && stepName !== stepFilter) {
          continue;
        }

        const status = payload.status === "success" ? "passed" : "failed";
        const testResult: TestResult = {
          suite: suiteLabel,
          step: stepName,
          status,
          duration: payload.duration_ms,
          error:
            status === "failed"
              ? payload.failed_assertion || payload.error
              : undefined,
        };

        this._onTestResult.fire(testResult);
        dispatched = true;
        if (status === "failed") {
          hadFailures = true;
        }
      } catch {
        // Ignore invalid JSON lines
      }
    }

    await fs.promises.unlink(liveEventsPath).catch(() => undefined);
    return { dispatched, hadFailures };
  }

  private parseTestResults(
    output: string,
    fallbackSuiteName?: string,
    stepFilter?: string
  ): { dispatched: boolean; hadFailures: boolean } {
    try {
      const lines = output.split(/\r?\n/).filter((line) => line.trim());
      let dispatched = false;
      let hadFailures = false;

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.type === "test") {
            const suiteLabel =
              (result.suite && String(result.suite)) ||
              fallbackSuiteName ||
              (result.suiteName && String(result.suiteName)) ||
              "unknown-suite";

            const testResult: TestResult = {
              suite: suiteLabel,
              step: result.name || "Unknown",
              status: result.status === "pass" ? "passed" : "failed",
              error: result.error,
              duration: result.duration,
            };
            if (!stepFilter || testResult.step === stepFilter) {
              this._onTestResult.fire(testResult);
              dispatched = true;
              if (testResult.status === "failed") {
                hadFailures = true;
              }
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
      return { dispatched, hadFailures };
    } catch (error) {
      console.warn("Failed to parse test results:", error);
      return { dispatched: false, hadFailures: false };
    }
  }

  async retestLast(): Promise<void> {
    if (!this.lastExecutionState) {
      vscode.window.showWarningMessage("No previous test execution found");
      return;
    }

    const { suitePath, stepName, stepId, config, userInputs } =
      this.lastExecutionState;

    this.outputChannel.show();
    this.outputChannel.appendLine("🔄 Retesting with previous configuration");
    this.outputChannel.appendLine(`📦 Suite: ${path.basename(suitePath)}`);
    if (stepName) {
      this.outputChannel.appendLine(`🎯 Step: ${stepName}`);
      if (stepId) {
        this.outputChannel.appendLine(`🆔 Step ID: ${stepId}`);
      }
    }
    this.outputChannel.appendLine(`🔧 Command: ${config.command}`);
    this.outputChannel.appendLine(
      `📄 Config file: ${config.configFile || "default settings"}`
    );
    this.outputChannel.appendLine(
      `⏰ Original execution: ${new Date(
        this.lastExecutionState.timestamp
      ).toLocaleString()}`
    );
    if (userInputs && Object.keys(userInputs).length > 0) {
      this.outputChannel.appendLine(
        `💾 Cached inputs: ${Object.keys(userInputs).length} values`
      );
    }
    this.outputChannel.appendLine("=".repeat(50));

    try {
      if (stepName) {
        if (!stepId) {
          vscode.window.showWarningMessage(
            "Não foi possível repetir a execução do step porque o step_id não está disponível."
          );
          return;
        }
        await this.runStep(suitePath, stepName, stepId, {
          useCachedInputs: true,
        });
      } else {
        await this.runSuite(suitePath, { useCachedInputs: true });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error during retest: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to retest: ${errorMessage}`);
    }
  }

  getLastExecutionState(): TestExecutionState | null {
    return this.lastExecutionState;
  }

  async handleInteractiveInput(
    request: UserInputRequest,
    options?: {
      useCache?: boolean;
      suppressNotifications?: boolean;
    }
  ): Promise<string | undefined> {
    this._onUserInputRequired.fire(request);

    try {
      return await this.inputService.handleUserInput(request, {
        useCache: options?.useCache,
        suppressNotifications: options?.suppressNotifications,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `❌ Input error (${request.inputName}): ${errorMessage}`
      );
      throw error;
    }
  }

  async clearInputCache(): Promise<void> {
    this.inputService.clearCache();
    vscode.window.showInformationMessage("Input cache cleared");
  }

  async showCachedInputs(): Promise<void> {
    await this.inputService.showCachedInputs();
  }

  async editCachedInput(): Promise<void> {
    await this.inputService.editCachedInput();
  }

  /**
   * Runs suite and shows JSON output in a formatted document
   */
  async runSuiteWithJsonOutput(suitePath: string): Promise<void> {
    this.outputChannel.show();
    this.outputChannel.appendLine("=".repeat(50));
    this.outputChannel.appendLine("🚀 Executando teste com saída JSON");
    this.outputChannel.appendLine(`📁 Suite path: ${suitePath}`);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(suitePath)
    );
    if (!workspaceFolder) {
      const errorMsg = "No workspace folder found";
      this.outputChannel.appendLine(`❌ ${errorMsg}`);
      vscode.window.showErrorMessage(errorMsg);
      return;
    }

    this.outputChannel.appendLine(`📁 Workspace folder: ${workspaceFolder.uri.fsPath}`);

    const config = await this.configService.getConfig(
      workspaceFolder.uri.fsPath
    );
    const cwd = config.workingDirectory || workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);

    this.outputChannel.appendLine(`📁 Working directory: ${cwd}`);
    this.outputChannel.appendLine(`📄 Relative path: ${relativePath}`);
    this.outputChannel.appendLine(`🔧 Command: ${config.command}`);

    const useInteractiveInputs = this.shouldUseInteractiveInputs(config);
    this.outputChannel.appendLine(`⚙️  Interactive inputs: ${useInteractiveInputs}`);

    vscode.window.showInformationMessage(`🚀 Executando teste: ${relativePath}`);

    try {
      // Prepare inputs if not using interactive mode
      const collectedInputs: Record<string, string> = {};
      let preparedInputs: {
        submissions: string[];
        userInputs: Record<string, string>;
      } = {
        submissions: [],
        userInputs: collectedInputs,
      };

      if (!useInteractiveInputs) {
        this.outputChannel.appendLine("🔄 Coletando inputs necessários...");
        try {
          preparedInputs = await this.prepareInteractiveInputs(
            suitePath,
            undefined,
            {
              useCache: true,
              suppressNotifications: false,
            }
          );
          Object.assign(collectedInputs, preparedInputs.userInputs);
          this.outputChannel.appendLine(
            `✅ Inputs coletados: ${Object.keys(collectedInputs).length} valores`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.outputChannel.appendLine(
            `❌ Failed to prepare test inputs: ${errorMessage}`
          );
          vscode.window.showErrorMessage(
            `Falha ao coletar inputs necessários: ${errorMessage}`
          );
          throw error;
        }
      }

      this.outputChannel.appendLine("🔄 Iniciando execução...");
      const result = await this.executeTestWithJsonOutput(
        suitePath,
        cwd,
        relativePath,
        config,
        preparedInputs,
        useInteractiveInputs,
        collectedInputs
      );

      this.outputChannel.appendLine(`✅ Execução concluída. Exit code: ${result.exitCode}`);
      this.outputChannel.appendLine(`📊 Output length: ${result.output.length} characters`);

      // Show RAW output in a new document
      const doc = await vscode.workspace.openTextDocument({
        content: result.output,
        language: 'text' // Use plain text to show raw output
      });
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside
      });

      if (result.success) {
        this.outputChannel.appendLine('✅ Teste executado com sucesso!');
        vscode.window.showInformationMessage('✅ Teste executado com sucesso!');
      } else {
        this.outputChannel.appendLine(`❌ Teste falhou com código ${result.exitCode}`);
        if (result.error) {
          this.outputChannel.appendLine(`🔴 Error output:\n${result.error}`);
        }
        vscode.window.showErrorMessage(`❌ Teste falhou com código ${result.exitCode}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`❌ Erro ao executar teste: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(`Stack trace:\n${error.stack}`);
      }
      vscode.window.showErrorMessage(`Erro ao executar teste: ${errorMessage}`);
      throw error;
    }
  }

  private async executeTestWithJsonOutput(
    suitePath: string,
    cwd: string,
    relativePath: string,
    config: FlowTestConfig,
    preparedInputs?: {
      submissions: string[];
      userInputs: Record<string, string>;
    },
    useInteractiveInputs: boolean = false,
    collectedInputs: Record<string, string> = {}
  ): Promise<{ success: boolean; exitCode: number; output: any; error?: string }> {
    return new Promise((resolve, reject) => {
      const args = [relativePath, '--verbose', '--no-report'];

      // Add live events for tree view updates
      const liveEventsPath = this.prepareLiveEventsFile(cwd);
      args.push('--live-events', liveEventsPath);

      // Add interactive flag if using interactive mode
      if (useInteractiveInputs) {
        args.push(FLOW_INPUT_FLAG);
      }

      const preparedArgs = quoteArgsForShell(args);
      this.outputChannel.appendLine(`📋 Comando completo: ${config.command} ${preparedArgs.join(' ')}`);
      this.outputChannel.appendLine(`📁 CWD: ${cwd}`);
      this.outputChannel.appendLine(`🔧 Interactive mode: ${useInteractiveInputs}`);
      if (preparedInputs && preparedInputs.submissions.length > 0) {
        this.outputChannel.appendLine(`🧩 Pre-collected inputs: ${preparedInputs.submissions.length}`);
      }
      this.outputChannel.appendLine("🔄 Spawning process...");

      const testProcess = spawn(config.command, preparedArgs, {
        cwd,
        shell: true,
        timeout: config.timeout
      });

      this.outputChannel.appendLine(`✅ Process spawned. PID: ${testProcess.pid}`);

      // If not using interactive mode and we have prepared inputs, send them
      if (!useInteractiveInputs && preparedInputs && preparedInputs.submissions.length > 0) {
        this.outputChannel.appendLine(`📤 Sending ${preparedInputs.submissions.length} prepared inputs...`);
        preparedInputs.submissions.forEach((submission, index) => {
          testProcess.stdin?.write(`${submission}\n`);
          this.outputChannel.appendLine(`  ✅ Input ${index + 1}: ${submission.substring(0, 50)}${submission.length > 50 ? '...' : ''}`);
        });
      }

      let output = '';
      let errorOutput = '';

      // Setup interactive input controller if needed
      const interactiveContext: InteractiveInputContext | undefined =
        useInteractiveInputs
          ? {
              process: testProcess,
              config,
              suitePath,
              stepName: undefined,
              stepId: undefined,
              collectedInputs,
              useCache: true,
              suppressNotifications: false,
            }
          : undefined;

      const interactiveController = interactiveContext
        ? this.createInteractiveInputController(interactiveContext)
        : undefined;

      testProcess.stdout?.on('data', (data) => {
        const text = data.toString();

        if (interactiveController) {
          const forwarded = interactiveController.handleData(text);
          if (forwarded) {
            output += forwarded;
            this.outputChannel.append(forwarded);
          }
        } else {
          output += text;
          this.outputChannel.append(text);
        }
      });

      testProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        this.outputChannel.append(`[STDERR] ${text}`);
      });

      testProcess.on('close', async (code) => {
        this.outputChannel.appendLine(`🏁 Process closed with code: ${code}`);

        if (interactiveController) {
          const remaining = interactiveController.flush();
          if (remaining) {
            output += remaining;
            this.outputChannel.append(remaining);
          }

          try {
            await interactiveController.waitForCompletion();
          } catch (interactiveError) {
            const message =
              interactiveError instanceof Error
                ? interactiveError.message
                : String(interactiveError);
            this.outputChannel.appendLine(
              `❌ Erro ao processar inputs interativos: ${message}`
            );
          }
        }

        const exitCode = code ?? 0;
        const success = exitCode === 0;

        this.outputChannel.appendLine(`📊 Total output length: ${output.length} bytes`);
        this.outputChannel.appendLine(`📊 Total error length: ${errorOutput.length} bytes`);

        // Process live events to update tree view
        const suiteLabel = path.basename(suitePath);
        let dispatched = false;
        let hadFailures = false;

        try {
          this.outputChannel.appendLine('🔍 Processing live events for tree view updates...');
          const liveResult = await this.processLiveEvents(
            liveEventsPath,
            suiteLabel,
            undefined
          );
          dispatched = liveResult.dispatched;
          hadFailures = liveResult.hadFailures;
          this.outputChannel.appendLine(`📊 Events processed: ${dispatched ? 'Yes' : 'No'}, Failures: ${hadFailures ? 'Yes' : 'No'}`);
        } catch (error) {
          this.outputChannel.appendLine(`⚠️ Failed to process live events: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Emit suite result
        const aggregatedResult = await this.loadAggregatedResult(config, cwd);
        this.emitSuiteResults(aggregatedResult, suiteLabel);

        // Return raw output for debugging
        this.outputChannel.appendLine('📋 Returning RAW output for debugging');

        resolve({
          success,
          exitCode,
          output: output, // Return raw string output
          error: errorOutput || undefined
        });
      });

      testProcess.on('error', (error) => {
        this.outputChannel.appendLine(`❌ Process error: ${error.message}`);
        if (error.stack) {
          this.outputChannel.appendLine(`Stack: ${error.stack}`);
        }
        reject(error);
      });
    });
  }

  stopTest(suitePath: string, stepName?: string): void {
    const processKey = `${suitePath}-${stepName || "all"}`;
    const process = this.runningProcesses.get(processKey);

    if (process) {
      process.kill();
      this.runningProcesses.delete(processKey);
      this.outputChannel.appendLine("");
      this.outputChannel.appendLine("🛑 Test execution stopped");
    }
  }

  dispose(): void {
    this.runningProcesses.forEach((process) => process.kill());
    this.runningProcesses.clear();
    this.outputChannel.dispose();
  }
}
