import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { TestResult, FlowTestConfig, TestExecutionState, UserInputRequest } from './models/types';
import { ConfigService } from './services/configService';
import { InputService } from './services/inputService';

export class TestRunner {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private outputChannel: vscode.OutputChannel;
  private configService: ConfigService;
  private inputService: InputService;
  private lastExecutionState: TestExecutionState | null = null;

  private _onTestResult: vscode.EventEmitter<TestResult> = new vscode.EventEmitter<TestResult>();
  readonly onTestResult: vscode.Event<TestResult> = this._onTestResult.event;

  private _onUserInputRequired: vscode.EventEmitter<UserInputRequest> = new vscode.EventEmitter<UserInputRequest>();
  readonly onUserInputRequired: vscode.Event<UserInputRequest> = this._onUserInputRequired.event;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Flow Test Runner');
    this.configService = ConfigService.getInstance();
    this.inputService = InputService.getInstance();
  }

  async runSuite(suitePath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(suitePath));
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const config = await this.configService.getConfig(workspaceFolder.uri.fsPath);
    const cwd = config.workingDirectory || workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);

    this.outputChannel.show();
    this.outputChannel.appendLine(`🚀 Running Flow Test Suite: ${relativePath}`);
    this.outputChannel.appendLine(`🔧 Using command: ${config.command}`);
    this.outputChannel.appendLine(`📄 Config file: ${config.configFile || 'default settings'}`);
    this.outputChannel.appendLine('='.repeat(50));

    try {
      await this.executeTest(suitePath, cwd, relativePath, undefined, config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to run test: ${errorMessage}`);
    }
  }

  async runStep(suitePath: string, stepName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(suitePath));
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const config = await this.configService.getConfig(workspaceFolder.uri.fsPath);
    const cwd = config.workingDirectory || workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);

    this.outputChannel.show();
    this.outputChannel.appendLine(`🎯 Running Flow Test Step: ${stepName} in ${relativePath}`);
    this.outputChannel.appendLine(`🔧 Using command: ${config.command}`);
    this.outputChannel.appendLine(`📄 Config file: ${config.configFile || 'default settings'}`);
    this.outputChannel.appendLine('='.repeat(50));

    try {
      await this.executeTest(suitePath, cwd, relativePath, stepName, config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to run test step: ${errorMessage}`);
      throw error;
    }
  }

  private async executeTest(suitePath: string, cwd: string, relativePath: string, stepName?: string, config?: FlowTestConfig): Promise<void> {
    let finalConfig: FlowTestConfig;
    if (!config) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(suitePath));
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }
      finalConfig = await this.configService.getConfig(workspaceFolder.uri.fsPath);
    } else {
      finalConfig = config;
    }

    this.lastExecutionState = {
      suitePath,
      stepName,
      config: finalConfig,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const processKey = `${suitePath}-${stepName || 'all'}`;

      if (this.runningProcesses.has(processKey)) {
        vscode.window.showWarningMessage('Test is already running');
        return resolve();
      }

      const args = [relativePath];
      const liveEventsPath = this.prepareLiveEventsFile(cwd);
      args.push('--live-events', liveEventsPath);

      if (stepName) {
        args.push('--step', stepName);
      }

      if (finalConfig.outputFormat === 'html' || finalConfig.outputFormat === 'both') {
        args.push('--html-output');
      }

      // Log do comando completo executado
      this.outputChannel.appendLine(`📋 Executing command: ${finalConfig.command} ${args.join(' ')}`);
      this.outputChannel.appendLine(`📁 Working directory: ${cwd}`);
      this.outputChannel.appendLine(`⚙️  Configuration: ${JSON.stringify(finalConfig, null, 2)}`);
      this.outputChannel.appendLine('');

      const testProcess = spawn(finalConfig.command, args, {
        cwd,
        shell: true,
        timeout: finalConfig.timeout
      });

      this.runningProcesses.set(processKey, testProcess);

      let output = '';
      let errorOutput = '';

      testProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputChannel.append(text);
      });

      testProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        this.outputChannel.append(`[ERROR] ${text}`);
      });

      testProcess.on('close', async (code) => {
        this.runningProcesses.delete(processKey);

        const suiteName = path.basename(suitePath);
        let dispatched = false;
        try {
          dispatched = await this.processLiveEvents(liveEventsPath, suiteName, stepName);
        } catch (error) {
          console.warn('Failed to process Flow Test live events:', error);
        }

        if (!dispatched && output.trim()) {
          dispatched = this.parseTestResults(output, suiteName, stepName);
        }

        if (stepName && !dispatched) {
          this._onTestResult.fire({
            suite: suiteName,
            step: stepName,
            status: code === 0 ? 'passed' : 'failed',
            error: code === 0 ? undefined : errorOutput || `Exited with code ${code}`
          });
          dispatched = true;
        }

        if (code === 0) {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine('✅ Test completed successfully');
          resolve();
        } else {
          this.outputChannel.appendLine('');
          this.outputChannel.appendLine(`❌ Test failed with exit code ${code}`);
          if (errorOutput) {
            this.outputChannel.appendLine(`Error output: ${errorOutput}`);
          }
          reject(new Error(`Test failed with exit code ${code}`));
        }
      });

      testProcess.on('error', (error) => {
        this.runningProcesses.delete(processKey);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`❌ Failed to start test: ${error.message}`);
        if (stepName) {
          this._onTestResult.fire({
            suite: path.basename(suitePath),
            step: stepName,
            status: 'failed',
            error: error.message
          });
        }
        reject(error);
      });
    });
  }

  private prepareLiveEventsFile(cwd: string): string {
    const eventsDir = path.join(cwd, '.fest-runner', 'live-events');
    fs.mkdirSync(eventsDir, { recursive: true });
    const filePath = path.join(eventsDir, `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jsonl`);
    fs.writeFileSync(filePath, '', 'utf8');
    return filePath;
  }

  private async processLiveEvents(liveEventsPath: string, suiteName: string, stepFilter?: string): Promise<boolean> {
    try {
      await fs.promises.access(liveEventsPath, fs.constants.F_OK);
    } catch {
      return false;
    }

    const content = await fs.promises.readFile(liveEventsPath, 'utf8');
    if (!content.trim()) {
      await fs.promises.unlink(liveEventsPath).catch(() => undefined);
      return false;
    }

    const lines = content.split(/\r?\n/).filter(line => line.trim());
    let dispatched = false;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type !== 'step_completed') {
          continue;
        }

        const payload = event.payload ?? {};
        const stepName = payload.step_name ?? 'Unknown';
        if (stepFilter && stepName !== stepFilter) {
          continue;
        }

        const status = payload.status === 'success' ? 'passed' : 'failed';
        const testResult: TestResult = {
          suite: suiteName,
          step: stepName,
          status,
          duration: payload.duration_ms,
          error: status === 'failed' ? payload.failed_assertion || payload.error : undefined
        };

        this._onTestResult.fire(testResult);
        dispatched = true;
      } catch {
        // Ignore invalid JSON lines
      }
    }

    await fs.promises.unlink(liveEventsPath).catch(() => undefined);
    return dispatched;
  }

  private parseTestResults(output: string, suiteName: string, stepFilter?: string): boolean {
    try {
      const lines = output.split(/\r?\n/).filter(line => line.trim());
      let dispatched = false;

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.type === 'test') {
            const testResult: TestResult = {
              suite: suiteName,
              step: result.name || 'Unknown',
              status: result.status === 'pass' ? 'passed' : 'failed',
              error: result.error,
              duration: result.duration
            };
            if (!stepFilter || testResult.step === stepFilter) {
              this._onTestResult.fire(testResult);
              dispatched = true;
            }
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
      return dispatched;
    } catch (error) {
      console.warn('Failed to parse test results:', error);
      return false;
    }
  }

  async retestLast(): Promise<void> {
    if (!this.lastExecutionState) {
      vscode.window.showWarningMessage('No previous test execution found');
      return;
    }

    const { suitePath, stepName, config, userInputs } = this.lastExecutionState;

    this.outputChannel.show();
    this.outputChannel.appendLine('🔄 Retesting with previous configuration');
    this.outputChannel.appendLine(`📦 Suite: ${path.basename(suitePath)}`);
    if (stepName) {
      this.outputChannel.appendLine(`🎯 Step: ${stepName}`);
    }
    this.outputChannel.appendLine(`🔧 Command: ${config.command}`);
    this.outputChannel.appendLine(`📄 Config file: ${config.configFile || 'default settings'}`);
    this.outputChannel.appendLine(`⏰ Original execution: ${new Date(this.lastExecutionState.timestamp).toLocaleString()}`);
    if (userInputs && Object.keys(userInputs).length > 0) {
      this.outputChannel.appendLine(`💾 Cached inputs: ${Object.keys(userInputs).length} values`);
    }
    this.outputChannel.appendLine('='.repeat(50));

    try {
      if (stepName) {
        await this.runStep(suitePath, stepName);
      } else {
        await this.runSuite(suitePath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error during retest: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to retest: ${errorMessage}`);
    }
  }

  getLastExecutionState(): TestExecutionState | null {
    return this.lastExecutionState;
  }

  async handleInteractiveInput(stepName: string, inputName: string, prompt: string, required: boolean = true, masked: boolean = false): Promise<string | undefined> {
    const request: UserInputRequest = {
      stepName,
      inputName,
      prompt,
      required,
      masked
    };

    this._onUserInputRequired.fire(request);

    try {
      return await this.inputService.handleUserInput(request);
    } catch (error) {
      this.outputChannel.appendLine(`❌ Input error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async clearInputCache(): Promise<void> {
    this.inputService.clearCache();
    vscode.window.showInformationMessage('Input cache cleared');
  }

  async showCachedInputs(): Promise<void> {
    await this.inputService.showCachedInputs();
  }

  async editCachedInput(): Promise<void> {
    await this.inputService.editCachedInput();
  }

  stopTest(suitePath: string, stepName?: string): void {
    const processKey = `${suitePath}-${stepName || 'all'}`;
    const process = this.runningProcesses.get(processKey);

    if (process) {
      process.kill();
      this.runningProcesses.delete(processKey);
      this.outputChannel.appendLine('');
      this.outputChannel.appendLine('🛑 Test execution stopped');
    }
  }

  dispose(): void {
    this.runningProcesses.forEach(process => process.kill());
    this.runningProcesses.clear();
    this.outputChannel.dispose();
  }
}
