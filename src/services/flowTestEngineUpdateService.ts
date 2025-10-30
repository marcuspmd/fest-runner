import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import { exec } from "child_process";

interface VersionInfo {
  current: string | null;
  latest: string | null;
}

export class FlowTestEngineUpdateService implements vscode.Disposable {
  private static readonly LAST_CHECK_KEY =
    "flowTestRunner.lastEngineUpdateCheck";
  private static readonly LAST_VERSION_KEY =
    "flowTestRunner.lastEngineVersion";
  private static readonly LAST_NOTIFIED_LATEST_KEY =
    "flowTestRunner.lastNotifiedEngineVersion";

  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidUpdateSchemaEmitter = new vscode.EventEmitter<void>();
  private checking = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    this.onDidUpdateSchemaEmitter.dispose();
    this.disposables.forEach((d) => d.dispose());
  }

  get onDidUpdateSchema(): vscode.Event<void> {
    return this.onDidUpdateSchemaEmitter.event;
  }

  async checkForUpdates(force = false): Promise<void> {
    if (this.checking) {
      return;
    }

    this.checking = true;
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }

      const config = vscode.workspace.getConfiguration(
        "flowTestRunner",
        workspaceFolder.uri
      );
      const command = config.get<string>("command", "flow-test-engine");
      const defaultIntervalHours = config.get<number>(
        "interfaceUpdateIntervalHours",
        6
      );

      await this.ensureLatestSchema(command, workspaceFolder.uri.fsPath, {
        silent: true,
      });

      const now = Date.now();
      const lastCheck =
        this.context.globalState.get<number>(
          FlowTestEngineUpdateService.LAST_CHECK_KEY
        ) ?? 0;

      const intervalMs = Math.max(defaultIntervalHours, 1) * 60 * 60 * 1000;
      if (!force && now - lastCheck < intervalMs) {
        return;
      }
      const versionInfo = await this.resolveVersions(
        command,
        workspaceFolder.uri.fsPath
      );

      if (!versionInfo.current || !versionInfo.latest) {
        return;
      }

      this.context.globalState.update(
        FlowTestEngineUpdateService.LAST_CHECK_KEY,
        now
      );

      if (
        this.compareSemver(versionInfo.latest, versionInfo.current) <= 0
      ) {
        return;
      }

      const alreadyNotifiedLatest = this.context.globalState.get<string>(
        FlowTestEngineUpdateService.LAST_NOTIFIED_LATEST_KEY
      );

      if (alreadyNotifiedLatest === versionInfo.latest) {
        return;
      }

      const message = `Nova versão do Flow Test Engine disponível (${versionInfo.latest}). Versão atual: ${versionInfo.current}. Deseja atualizar as interfaces agora?`;

      const choice = await vscode.window.showInformationMessage(
        message,
        "Atualizar interfaces",
        "Depois"
      );

      if (choice === "Atualizar interfaces") {
        await this.updateInterfaces(
          command,
          workspaceFolder.uri.fsPath,
          versionInfo.latest
        );
      }

      await this.context.globalState.update(
        FlowTestEngineUpdateService.LAST_NOTIFIED_LATEST_KEY,
        versionInfo.latest
      );
    } catch (error) {
      console.warn("Failed to check Flow Test Engine updates:", error);
    } finally {
      this.checking = false;
    }
  }

  async updateInterfaces(
    command: string,
    workspacePath: string,
    targetVersion?: string,
    options?: { silent?: boolean }
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      "flowTestRunner",
      vscode.Uri.file(workspacePath)
    );
    const template = config.get<string>(
      "interfaceUpdateCommand",
      "${command} schema --format json"
    );
    const outputFile = config.get<string>(
      "interfaceUpdateOutputFile",
      "flow-test-engine.schema.json"
    );

    const finalCommand = this.resolveTemplateCommand(template, command);

    const stdout = await this.execShell(finalCommand, workspacePath);
    await this.persistInterfaceFile(outputFile, stdout);

    if (targetVersion) {
      await this.context.globalState.update(
        FlowTestEngineUpdateService.LAST_VERSION_KEY,
        targetVersion
      );
    }

    if (!options?.silent) {
      vscode.window.showInformationMessage(
        "Interfaces do Flow Test Engine sincronizadas com sucesso."
      );
    }

    this.onDidUpdateSchemaEmitter.fire();
  }

  getGeneratedInterfacePath(fileName?: string): vscode.Uri {
    const baseUri = vscode.Uri.joinPath(this.context.globalStorageUri, "engine");
    const target = fileName ?? "flow-test-engine.schema.json";
    return vscode.Uri.joinPath(baseUri, target);
  }

  async ensureLatestSchema(
    command: string,
    workspacePath: string,
    options?: { versionHint?: string | null; silent?: boolean }
  ): Promise<void> {
    try {
      const schemaUri = this.getGeneratedInterfacePath();
      const exists = await this.fileExists(schemaUri);
      let currentVersion = options?.versionHint ?? null;

      if (!currentVersion) {
        currentVersion = await this.getInstalledVersion(command, workspacePath);
      }

      const lastVersion = this.context.globalState.get<string>(
        FlowTestEngineUpdateService.LAST_VERSION_KEY
      );

      if (!exists || (currentVersion && currentVersion !== lastVersion)) {
        await this.updateInterfaces(command, workspacePath, currentVersion ?? undefined, {
          silent: options?.silent ?? true,
        });
      }
    } catch (error) {
      console.warn("Failed to ensure Flow Test Engine schema:", error);
    }
  }

  private resolveTemplateCommand(template: string, command: string): string {
    if (!template.includes("${command}")) {
      return template;
    }
    return template.replace(/\$\{command\}/g, command);
  }

  private async resolveVersions(
    command: string,
    workspacePath: string
  ): Promise<VersionInfo> {
    const current = await this.getInstalledVersion(command, workspacePath);
    const latest = await this.getLatestVersionFromRegistry();
    return { current, latest };
  }

  private getInstalledVersion(
    command: string,
    workspacePath: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      exec(
        `${command} --version`,
        { cwd: workspacePath },
        (_error, stdout) => {
          if (!stdout) {
            resolve(null);
            return;
          }
          const version = stdout.trim().split(/\s+/).pop();
          resolve(version ?? null);
        }
      );
    });
  }

  private getLatestVersionFromRegistry(): Promise<string | null> {
    return new Promise((resolve) => {
      const request = https.get(
        "https://registry.npmjs.org/flow-test-engine/latest",
        (response) => {
          if (response.statusCode !== 200) {
            resolve(null);
            return;
          }
          const chunks: Uint8Array[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            try {
              const payload = JSON.parse(
                Buffer.concat(chunks).toString("utf8")
              );
              const version =
                typeof payload?.version === "string"
                  ? payload.version
                  : null;
              resolve(version);
            } catch {
              resolve(null);
            }
          });
        }
      );

      request.on("error", () => resolve(null));
      request.end();
    });
  }

  private async persistInterfaceFile(
    fileName: string,
    contents: string
  ): Promise<void> {
    const baseUri = vscode.Uri.joinPath(this.context.globalStorageUri, "engine");
    await vscode.workspace.fs.createDirectory(baseUri);

    const targetUri = vscode.Uri.joinPath(baseUri, fileName);
    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(contents, "utf8")
    );
  }

  private async fileExists(target: vscode.Uri): Promise<boolean> {
    try {
      await fs.promises.access(target.fsPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private compareSemver(a: string, b: string): number {
    const clean = (value: string) =>
      value.replace(/[^0-9.]/g, "").split(".").map(Number);
    const [aMajor = 0, aMinor = 0, aPatch = 0] = clean(a);
    const [bMajor = 0, bMinor = 0, bPatch = 0] = clean(b);

    if (aMajor !== bMajor) {
      return aMajor - bMajor;
    }
    if (aMinor !== bMinor) {
      return aMinor - bMinor;
    }
    return aPatch - bPatch;
  }

  private execShell(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        { cwd, maxBuffer: 1024 * 1024 * 8 },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `Falha ao executar comando '${command}': ${stderr || error.message}`
              )
            );
            return;
          }
          resolve(stdout);
        }
      );
    });
  }
}
