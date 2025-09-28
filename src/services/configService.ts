import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { FlowTestConfig } from '../models/types';

export class ConfigService {
  private static instance: ConfigService;
  private configCache: Map<string, FlowTestConfig> = new Map();
  private configPathIndex: Map<string, string> = new Map();
  private workspaceConfigPaths: Map<string, string> = new Map();

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
    this.updateConfigPathIndex(workspacePath, config.configFile);
    return config;
  }

  private async loadConfig(workspacePath: string): Promise<FlowTestConfig> {
    const defaultConfig: FlowTestConfig = {
      command: 'flow-test-engine',
      outputFormat: 'both',
      timeout: 30000,
      retryCount: 0,
      workingDirectory: workspacePath,
      testDirectories: [workspacePath],
      discovery: {
        patterns: ['**/*.yml', '**/*.yaml'],
        exclude: ['**/node_modules/**']
      },
      interactiveInputs: true,
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
        fileConfig.configFile = path.normalize(configFilePath);
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

    mergedConfig.testDirectories = this.normalizeDirectories(
      mergedConfig.testDirectories,
      workspacePath,
      mergedConfig.configFile
    );

    mergedConfig.discovery = this.normalizeDiscoveryConfig(
      mergedConfig.discovery
    );

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

    const testDirectorySource =
      config.testDirectories ??
      config.test_directories ??
      config.testDirectory ??
      config.test_directory;

    if (testDirectorySource) {
      const normalizedTestDirs = this.normalizeTestDirectoryInput(
        testDirectorySource,
        path.dirname(configPath)
      );
      if (normalizedTestDirs.length > 0) {
        validatedConfig.testDirectories = normalizedTestDirs;
      }
    }

    if (config.discovery && typeof config.discovery === 'object') {
      const normalizedDiscovery = this.normalizeDiscoveryInput(config.discovery);
      if (normalizedDiscovery) {
        validatedConfig.discovery = normalizedDiscovery;
      }
    }

    const interactiveSource =
      config.interactiveInputs ?? config.interactive_inputs ?? config.interactive;
    if (typeof interactiveSource === 'boolean') {
      validatedConfig.interactiveInputs = interactiveSource;
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

  private normalizeTestDirectoryInput(value: unknown, baseDir: string): string[] {
    const directories = this.toStringArray(value);
    if (directories.length === 0) {
      return [];
    }

    const normalized = directories.map(dir => this.resolveRelativePath(baseDir, dir));
    return this.dedupeStrings(normalized);
  }

  private normalizeDiscoveryInput(value: any): FlowTestConfig['discovery'] | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const patterns = this.dedupeStrings(
      this.toStringArray(value.patterns ?? value.pattern ?? value.include ?? value.includes)
    );

    const exclude = this.dedupeStrings(
      this.toStringArray(value.exclude ?? value.excludes)
    );

    const discoveryConfig: NonNullable<FlowTestConfig['discovery']> = {};

    if (patterns.length > 0) {
      discoveryConfig.patterns = patterns;
    }

    if (exclude.length > 0) {
      discoveryConfig.exclude = exclude;
    }

    return Object.keys(discoveryConfig).length > 0 ? discoveryConfig : undefined;
  }

  private normalizeDirectories(
    directories: string[] | undefined,
    workspacePath: string,
    configFile?: string
  ): string[] {
    const baseDir = configFile ? path.dirname(configFile) : workspacePath;
    const source = directories && directories.length > 0 ? directories : [workspacePath];
    const normalized = source.map(dir => this.resolveRelativePath(baseDir, dir));
    return this.dedupeStrings(normalized);
  }

  private normalizeDiscoveryConfig(
    discovery: FlowTestConfig['discovery'] | undefined
  ): NonNullable<FlowTestConfig['discovery']> {
    const patterns = this.dedupeStrings(discovery?.patterns);
    const exclude = this.dedupeStrings(discovery?.exclude);

    const normalizedPatterns =
      patterns.length > 0 ? patterns : ['**/*.yml', '**/*.yaml'];

    const excludeSet = new Set<string>(exclude);
    excludeSet.add('**/node_modules/**');

    return {
      patterns: normalizedPatterns,
      exclude: Array.from(excludeSet)
    };
  }

  private toStringArray(value: unknown): string[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }

    return [];
  }

  private dedupeStrings(values?: string[]): string[] {
    if (!values || values.length === 0) {
      return [];
    }

    const result: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }

      seen.add(trimmed);
      result.push(trimmed);
    }

    return result;
  }

  private resolveRelativePath(baseDir: string, target: string): string {
    const normalizedBase = baseDir && path.isAbsolute(baseDir)
      ? baseDir
      : path.resolve(baseDir || '.');

    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(normalizedBase, target);

    return path.normalize(resolved);
  }

  private updateConfigPathIndex(workspacePath: string, configFile?: string): void {
    const previousPath = this.workspaceConfigPaths.get(workspacePath);
    if (previousPath) {
      this.configPathIndex.delete(previousPath);
      this.workspaceConfigPaths.delete(workspacePath);
    }

    if (configFile) {
      const normalizedConfigPath = this.normalizeFilesystemPath(configFile);
      this.workspaceConfigPaths.set(workspacePath, normalizedConfigPath);
      this.configPathIndex.set(normalizedConfigPath, workspacePath);
    }
  }

  private normalizeFilesystemPath(value: string): string {
    return path.normalize(value);
  }

  clearCache(): void {
    this.configCache.clear();
    this.configPathIndex.clear();
    this.workspaceConfigPaths.clear();
  }

  clearCacheForWorkspace(workspacePath: string): void {
    this.configCache.delete(workspacePath);
    const existingPath = this.workspaceConfigPaths.get(workspacePath);
    if (existingPath) {
      this.configPathIndex.delete(existingPath);
      this.workspaceConfigPaths.delete(workspacePath);
    }
  }

  invalidateConfigForFile(configFilePath: string): void {
    const normalizedPath = this.normalizeFilesystemPath(configFilePath);
    const workspacePath = this.configPathIndex.get(normalizedPath);
    if (workspacePath) {
      this.clearCacheForWorkspace(workspacePath);
    }
  }

  async createDefaultConfigFile(workspacePath: string): Promise<void> {
    const configPath = path.join(workspacePath, 'flow-test.config.yml');

    const defaultConfigContent = `# Flow Test Runner Configuration
command: flow-test-engine
outputFormat: both
timeout: 30000
retryCount: 0

# Directory containing Flow Test suites (relative to this config file)
test_directory: ./tests

# Enable interactive prompts (requires updated Flow Test Engine)
interactive_inputs: true

# To watch multiple locations, uncomment below and remove test_directory
# test_directories:
#   - ./tests
#   - ./integration-tests

# File discovery controls (patterns are relative to each test directory)
discovery:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/tests/**/*.yaml"
  exclude:
    - "**/temp/**"
    - "**/node_modules/**"
    - "**/results/**"

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
