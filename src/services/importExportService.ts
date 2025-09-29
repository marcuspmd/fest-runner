import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { ConfigService } from "./configService";
import { FlowTestConfig } from "../models/types";

export interface ImportOptions {
  workspacePath: string;
  inputPath: string;
  outputPath: string;
  type: "swagger" | "postman";
  preserveFolders?: boolean;
  analyzeDeps?: boolean;
}

export interface ExportOptions {
  workspacePath: string;
  inputPath: string;
  outputPath: string;
  fromResults?: boolean;
}

export interface ImportExportResult {
  outputPath: string;
  command: string;
  args: string[];
}

export class ImportExportService implements vscode.Disposable {
  private static instance: ImportExportService;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly configService = ConfigService.getInstance();

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "Flow Test Import/Export"
    );
  }

  static getInstance(): ImportExportService {
    if (!ImportExportService.instance) {
      ImportExportService.instance = new ImportExportService();
    }
    return ImportExportService.instance;
  }

  dispose(): void {
    this.outputChannel.dispose();
  }

  async importSwagger(options: ImportOptions): Promise<ImportExportResult> {
    const config = await this.configService.getConfig(options.workspacePath);
    const command = this.resolveCommand(config);
    const cwd = config.workingDirectory ?? options.workspacePath;

    await this.ensureOutputDirectory(options.outputPath);

    const args = [
      "--swagger-import",
      options.inputPath,
      "--swagger-output",
      options.outputPath,
    ];

    if (config.configFile) {
      args.push("--config", config.configFile);
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(
      "================ Flow Test Swagger Import ================"
    );
    this.outputChannel.appendLine(
      `Command: ${command} ${args
        .map((value) => this.quoteIfNeeded(value))
        .join(" ")}`
    );
    this.outputChannel.appendLine(`Working directory: ${cwd}`);
    this.outputChannel.appendLine(`Input file: ${options.inputPath}`);
    this.outputChannel.appendLine(`Output directory: ${options.outputPath}`);
    this.outputChannel.appendLine(
      "=========================================================="
    );

    await this.runCommand(command, args, cwd, config.timeout ?? 30000);

    this.outputChannel.appendLine("✅ Swagger import completed successfully\n");

    return {
      outputPath: options.outputPath,
      command,
      args,
    };
  }

  async importPostman(options: ImportOptions): Promise<ImportExportResult> {
    const config = await this.configService.getConfig(options.workspacePath);
    const command = this.resolveCommand(config);
    const cwd = config.workingDirectory ?? options.workspacePath;

    await this.ensureOutputDirectory(options.outputPath);

    const args = [
      "--postman-import",
      options.inputPath,
      "--postman-import-output",
      options.outputPath,
    ];

    if (options.preserveFolders) {
      args.push("--postman-preserve-folders");
    }

    if (options.analyzeDeps) {
      args.push("--postman-analyze-deps");
    }

    if (config.configFile) {
      args.push("--config", config.configFile);
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(
      "================ Flow Test Postman Import ================"
    );
    this.outputChannel.appendLine(
      `Command: ${command} ${args
        .map((value) => this.quoteIfNeeded(value))
        .join(" ")}`
    );
    this.outputChannel.appendLine(`Working directory: ${cwd}`);
    this.outputChannel.appendLine(`Input file: ${options.inputPath}`);
    this.outputChannel.appendLine(`Output directory: ${options.outputPath}`);
    this.outputChannel.appendLine(
      "=========================================================="
    );

    await this.runCommand(command, args, cwd, config.timeout ?? 30000);

    this.outputChannel.appendLine("✅ Postman import completed successfully\n");

    return {
      outputPath: options.outputPath,
      command,
      args,
    };
  }

  async exportPostman(options: ExportOptions): Promise<ImportExportResult> {
    const config = await this.configService.getConfig(options.workspacePath);
    const command = this.resolveCommand(config);
    const cwd = config.workingDirectory ?? options.workspacePath;

    await this.ensureOutputDirectory(path.dirname(options.outputPath));

    const args: string[] = [];

    if (options.fromResults) {
      args.push("--postman-export-from-results", options.inputPath);
    } else {
      args.push("--postman-export", options.inputPath);
    }

    args.push("--postman-output", options.outputPath);

    if (config.configFile) {
      args.push("--config", config.configFile);
    }

    this.outputChannel.show(true);
    this.outputChannel.appendLine(
      "================ Flow Test Postman Export ================"
    );
    this.outputChannel.appendLine(
      `Command: ${command} ${args
        .map((value) => this.quoteIfNeeded(value))
        .join(" ")}`
    );
    this.outputChannel.appendLine(`Working directory: ${cwd}`);
    this.outputChannel.appendLine(`Input: ${options.inputPath}`);
    this.outputChannel.appendLine(`Output file: ${options.outputPath}`);
    this.outputChannel.appendLine(
      "=========================================================="
    );

    await this.runCommand(command, args, cwd, config.timeout ?? 30000);

    this.outputChannel.appendLine("✅ Postman export completed successfully\n");

    return {
      outputPath: options.outputPath,
      command,
      args,
    };
  }

  private resolveCommand(config: FlowTestConfig): string {
    if (config.command && config.command.trim().length > 0) {
      return config.command.trim();
    }

    return "flow-test-engine";
  }

  private async ensureOutputDirectory(targetPath: string): Promise<void> {
    await fs.promises.mkdir(targetPath, { recursive: true });
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let process: ChildProcess;
      try {
        process = spawn(command, args, {
          cwd,
          shell: false,
          timeout,
        });
      } catch (error) {
        return reject(error);
      }

      process.stdout?.on("data", (data) => {
        this.outputChannel.append(data.toString());
      });

      let stderr = "";
      process.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        this.outputChannel.append(text);
      });

      process.on("error", (error) => {
        reject(error);
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          const message =
            stderr.trim().length > 0
              ? stderr.trim()
              : `Process exited with code ${code}`;
          reject(new Error(message));
        }
      });
    });
  }

  private quoteIfNeeded(value: string): string {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  }
}