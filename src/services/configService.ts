import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { FlowTestConfig } from '../models/types';

export class ConfigService {
  private static instance: ConfigService;
  private configCache: Map<string, FlowTestConfig> = new Map();

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async getConfig(workspacePath: string): Promise<FlowTestConfig> {
    if (this.configCache.has(workspacePath)) {
      return this.configCache.get(workspacePath)!;
    }

    const config = await this.loadConfig(workspacePath);
    this.configCache.set(workspacePath, config);
    return config;
  }

  private async loadConfig(workspacePath: string): Promise<FlowTestConfig> {
    const defaultConfig: FlowTestConfig = {
      command: 'flow-test-engine',
      outputFormat: 'both',
      timeout: 30000,
      retryCount: 0,
      workingDirectory: workspacePath,
      reporting: {
        outputDir: 'results',
        html: {
          outputSubdir: 'html',
          perSuite: true,
          aggregate: true
        }
      }
    };

    const configFromSettings = this.loadFromVSCodeSettings();
    let fileConfig: Partial<FlowTestConfig> = {};

    const configFilePath = await this.findConfigFile(workspacePath);
    if (configFilePath) {
      try {
        const configContent = await fs.promises.readFile(configFilePath, 'utf8');
        const parsedConfig = yaml.parse(configContent);
        fileConfig = this.validateAndTransformConfig(parsedConfig, configFilePath);
        fileConfig.configFile = configFilePath;
      } catch (error) {
        vscode.window.showWarningMessage(
          `Failed to load config file ${configFilePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const mergedConfig: FlowTestConfig = {
      ...defaultConfig,
      ...configFromSettings,
      ...fileConfig
    };

    const reportingLayers = [
      defaultConfig.reporting,
      configFromSettings.reporting,
      fileConfig.reporting
    ].filter(Boolean) as NonNullable<FlowTestConfig['reporting']>[];

    if (reportingLayers.length > 0) {
      const mergedReporting: NonNullable<FlowTestConfig['reporting']> = {};

      for (const layer of reportingLayers) {
        if (layer.outputDir) {
          mergedReporting.outputDir = layer.outputDir;
        }

        if (layer.html) {
          mergedReporting.html = {
            ...mergedReporting.html,
            ...layer.html
          };
        }
      }

      mergedConfig.reporting = mergedReporting;
    }

    return mergedConfig;
  }

  private async findConfigFile(workspacePath: string): Promise<string | null> {
    const customConfigPath = vscode.workspace.getConfiguration('flowTestRunner').get<string>('configFile');

    if (customConfigPath) {
      const absolutePath = path.isAbsolute(customConfigPath)
        ? customConfigPath
        : path.join(workspacePath, customConfigPath);

      try {
        await fs.promises.access(absolutePath, fs.constants.F_OK);
        return absolutePath;
      } catch {
        vscode.window.showWarningMessage(`Custom config file not found: ${absolutePath}`);
      }
    }

    const defaultConfigPath = path.join(workspacePath, 'flow-test.config.yml');
    try {
      await fs.promises.access(defaultConfigPath, fs.constants.F_OK);
      return defaultConfigPath;
    } catch {
      return null;
    }
  }

  private loadFromVSCodeSettings(): Partial<FlowTestConfig> {
    const config = vscode.workspace.getConfiguration('flowTestRunner');

    return {
      command: config.get<string>('command'),
      outputFormat: config.get<'json' | 'html' | 'both'>('outputFormat'),
      timeout: config.get<number>('timeout'),
      retryCount: config.get<number>('retryCount')
    };
  }

  private validateAndTransformConfig(config: any, configPath: string): Partial<FlowTestConfig> {
    const validatedConfig: Partial<FlowTestConfig> = {};

    if (config.command && typeof config.command === 'string') {
      validatedConfig.command = config.command;
    }

    if (config.outputFormat && ['json', 'html', 'both'].includes(config.outputFormat)) {
      validatedConfig.outputFormat = config.outputFormat;
    }

    if (config.timeout && typeof config.timeout === 'number' && config.timeout > 0) {
      validatedConfig.timeout = config.timeout;
    }

    if (config.retryCount && typeof config.retryCount === 'number' && config.retryCount >= 0) {
      validatedConfig.retryCount = config.retryCount;
    }

    if (config.workingDirectory && typeof config.workingDirectory === 'string') {
      const workingDir = path.isAbsolute(config.workingDirectory)
        ? config.workingDirectory
        : path.join(path.dirname(configPath), config.workingDirectory);
      validatedConfig.workingDirectory = workingDir;
    } else if (config.working_directory && typeof config.working_directory === 'string') {
      const workingDir = path.isAbsolute(config.working_directory)
        ? config.working_directory
        : path.join(path.dirname(configPath), config.working_directory);
      validatedConfig.workingDirectory = workingDir;
    }

    if (config.reporting && typeof config.reporting === 'object') {
      const reportingSource = config.reporting;
      const reportingConfig: NonNullable<FlowTestConfig['reporting']> = {};

      const outputDirValue = reportingSource.outputDir ?? reportingSource.output_dir;
      if (typeof outputDirValue === 'string' && outputDirValue.trim().length > 0) {
        reportingConfig.outputDir = outputDirValue.trim();
      }

      if (reportingSource.html && typeof reportingSource.html === 'object') {
        const htmlSource = reportingSource.html;
        const htmlConfig: NonNullable<NonNullable<FlowTestConfig['reporting']>['html']> = {};

        const outputSubdirValue =
          htmlSource.outputSubdir ?? htmlSource.output_subdir;
        if (typeof outputSubdirValue === 'string' && outputSubdirValue.trim().length > 0) {
          htmlConfig.outputSubdir = outputSubdirValue.trim();
        }

        if (typeof htmlSource.perSuite === 'boolean') {
          htmlConfig.perSuite = htmlSource.perSuite;
        } else if (typeof htmlSource.per_suite === 'boolean') {
          htmlConfig.perSuite = htmlSource.per_suite;
        }

        if (typeof htmlSource.aggregate === 'boolean') {
          htmlConfig.aggregate = htmlSource.aggregate;
        }

        if (Object.keys(htmlConfig).length > 0) {
          reportingConfig.html = htmlConfig;
        }
      }

      if (Object.keys(reportingConfig).length > 0) {
        validatedConfig.reporting = reportingConfig;
      }
    }

    return validatedConfig;
  }

  clearCache(): void {
    this.configCache.clear();
  }

  async createDefaultConfigFile(workspacePath: string): Promise<void> {
    const configPath = path.join(workspacePath, 'flow-test.config.yml');

    const defaultConfigContent = `# Flow Test Runner Configuration
command: flow-test-engine
outputFormat: both
timeout: 30000
retryCount: 0

# Optional: Custom working directory (relative to config file)
# workingDirectory: ./tests

# Reporting configuration (matches Flow Test Engine defaults)
reporting:
  output_dir: ./results
  formats:
    - json
    - html
  html:
    output_subdir: html
    per_suite: true
    aggregate: true

# Examples of other configuration options:
# command: ./custom-flow-test-binary
# outputFormat: html
# timeout: 60000
# retryCount: 2
`;

    try {
      await fs.promises.writeFile(configPath, defaultConfigContent, 'utf8');
      vscode.window.showInformationMessage(`Created default config file: ${configPath}`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create config file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async promptForConfigFile(): Promise<string | undefined> {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: 'Select Flow Test Config File',
      filters: {
        'YAML files': ['yml', 'yaml'],
        'All files': ['*']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const configPath = fileUri[0].fsPath;

      await vscode.workspace.getConfiguration('flowTestRunner').update(
        'configFile',
        configPath,
        vscode.ConfigurationTarget.Workspace
      );

      this.clearCache();
      vscode.window.showInformationMessage(`Config file set to: ${configPath}`);
      return configPath;
    }

    return undefined;
  }
}
