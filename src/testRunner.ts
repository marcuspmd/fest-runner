import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { TestResult } from './models/types';

export class TestRunner {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private outputChannel: vscode.OutputChannel;

  private _onTestResult: vscode.EventEmitter<TestResult> = new vscode.EventEmitter<TestResult>();
  readonly onTestResult: vscode.Event<TestResult> = this._onTestResult.event;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Flow Test Runner');
  }

  async runSuite(suitePath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(suitePath));
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const cwd = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);

    this.outputChannel.show();
    this.outputChannel.appendLine(`Running Flow Test: ${relativePath}`);
    this.outputChannel.appendLine('='.repeat(50));

    try {
      await this.executeTest(relativePath, cwd);
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

    const cwd = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(cwd, suitePath);

    this.outputChannel.show();
    this.outputChannel.appendLine(`Running Flow Test Step: ${stepName} in ${relativePath}`);
    this.outputChannel.appendLine('='.repeat(50));

    try {
      await this.executeTest(relativePath, cwd, stepName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to run test step: ${errorMessage}`);
      throw error;
    }
  }

  private async executeTest(testFile: string, cwd: string, stepName?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const processKey = `${testFile}-${stepName || 'all'}`;

      if (this.runningProcesses.has(processKey)) {
        vscode.window.showWarningMessage('Test is already running');
        return resolve();
      }

      const args = ['--file', testFile];
      if (stepName) {
        args.push('--step', stepName);
      }
      args.push('--reporter', 'json');

      const festProcess = spawn('fest', args, {
        cwd,
        shell: true
      });

      this.runningProcesses.set(processKey, festProcess);

      let output = '';
      let errorOutput = '';

      festProcess.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputChannel.append(text);
      });

      festProcess.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        this.outputChannel.append(`[ERROR] ${text}`);
      });

      festProcess.on('close', (code) => {
        this.runningProcesses.delete(processKey);

        if (output.trim()) {
          this.parseTestResults(output, testFile);
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
          if (stepName) {
            this._onTestResult.fire({
              suite: path.basename(testFile),
              step: stepName,
              status: 'failed',
              error: errorOutput || `Exited with code ${code}`
            });
          }
          reject(new Error(`Test failed with exit code ${code}`));
        }
      });

      festProcess.on('error', (error) => {
        this.runningProcesses.delete(processKey);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`❌ Failed to start test: ${error.message}`);
        if (stepName) {
          this._onTestResult.fire({
            suite: path.basename(testFile),
            step: stepName,
            status: 'failed',
            error: error.message
          });
        }
        reject(error);
      });
    });
  }

  private parseTestResults(output: string, suitePath: string): void {
    try {
      const lines = output.split(/\r?\n/).filter(line => line.trim());

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (result.type === 'test') {
            const testResult: TestResult = {
              suite: path.basename(suitePath),
              step: result.name || 'Unknown',
              status: result.status === 'pass' ? 'passed' : 'failed',
              error: result.error,
              duration: result.duration
            };
            this._onTestResult.fire(testResult);
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    } catch (error) {
      console.warn('Failed to parse test results:', error);
    }
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
