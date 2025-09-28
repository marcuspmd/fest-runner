import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { ConfigService } from "./configService";
import {
  FlowTestConfig,
  FlowTestGraphConfig,
  FlowTestGraphDirection,
} from "../models/types";

export interface GraphGenerationOptions {
  workspacePath: string;
  outputPath: string;
  direction?: FlowTestGraphDirection;
  noOrphans?: boolean;
  priority?: string[];
  suites?: string[];
  nodes?: string[];
  tags?: string[];
  title?: string;
}

export interface GraphGenerationResult {
  outputPath: string;
  command: string;
  args: string[];
}

export class GraphService implements vscode.Disposable {
  private static instance: GraphService;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly configService = ConfigService.getInstance();

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Flow Test Graphs");
  }

  static getInstance(): GraphService {
    if (!GraphService.instance) {
      GraphService.instance = new GraphService();
    }
    return GraphService.instance;
  }

  dispose(): void {
    this.outputChannel.dispose();
  }

  async generateMermaidGraph(
    options: GraphGenerationOptions
  ): Promise<GraphGenerationResult> {
    const config = await this.configService.getConfig(options.workspacePath);
    const graphConfig = config.graph ?? {};
    const command = this.resolveCommand(config, graphConfig);
    const cwd = config.workingDirectory ?? options.workspacePath;

    await this.ensureOutputDirectory(options.outputPath);

    const args = this.buildArguments(options, graphConfig, config);

    this.outputChannel.show(true);
    this.outputChannel.appendLine(
      "================ Flow Test Graph ================"
    );
    this.outputChannel.appendLine(
      `Command: ${command} ${args
        .map((value) => this.quoteIfNeeded(value))
        .join(" ")}`
    );
    this.outputChannel.appendLine(`Working directory: ${cwd}`);
    this.outputChannel.appendLine(`Output file: ${options.outputPath}`);
    this.outputChannel.appendLine(
      "================================================="
    );

    await this.runCommand(command, args, cwd, config.timeout ?? 30000);

    this.outputChannel.appendLine("✅ Graph generated successfully\n");

    return {
      outputPath: options.outputPath,
      command,
      args,
    };
  }

  private resolveCommand(
    config: FlowTestConfig,
    graphConfig: FlowTestGraphConfig
  ): string {
    if (graphConfig.command && graphConfig.command.trim().length > 0) {
      return graphConfig.command.trim();
    }

    if (config.command && config.command.trim().length > 0) {
      return config.command.trim();
    }

    return "flow-test-engine";
  }

  private buildArguments(
    options: GraphGenerationOptions,
    graphConfig: FlowTestGraphConfig,
    config: FlowTestConfig
  ): string[] {
    const args: string[] = ["graph", "mermaid"];

    const direction = options.direction ?? graphConfig.defaultDirection;
    if (direction) {
      args.push("--direction", direction.toUpperCase());
    }

    const noOrphans = options.noOrphans ?? graphConfig.noOrphans ?? false;
    if (noOrphans) {
      args.push("--no-orphans");
    }

    this.pushListArgument(args, "--priority", options.priority);
    this.pushListArgument(args, "--suite", options.suites);
    this.pushListArgument(args, "--node", options.nodes);
    this.pushListArgument(args, "--tag", options.tags);

    if (options.title && options.title.trim().length > 0) {
      args.push("--title", options.title.trim());
    }

    if (config.configFile) {
      args.push("--config", config.configFile);
    }

    args.push("--output", options.outputPath);

    return args;
  }

  private pushListArgument(
    args: string[],
    flag: string,
    values?: string[]
  ): void {
    if (!values || values.length === 0) {
      return;
    }

    const normalized = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (normalized.length === 0) {
      return;
    }

    const unique = Array.from(new Set(normalized));
    args.push(flag, unique.join(","));
  }

  private async ensureOutputDirectory(targetFile: string): Promise<void> {
    const directory = path.dirname(targetFile);
    await fs.promises.mkdir(directory, { recursive: true });
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let graphProcess: ChildProcess;
      try {
        graphProcess = spawn(command, args, {
          cwd,
          shell: true,
          timeout,
        });
      } catch (error) {
        return reject(error);
      }

      graphProcess.stdout?.on("data", (data) => {
        this.outputChannel.append(data.toString());
      });

      let stderr = "";
      graphProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        this.outputChannel.append(text);
      });

      graphProcess.on("error", (error) => {
        reject(error);
      });

      graphProcess.on("close", (code) => {
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
