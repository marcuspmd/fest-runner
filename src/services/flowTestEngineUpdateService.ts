import * as vscode from "vscode";
import * as https from "https";
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

  private readonly disposables: vscode.Disposable[] = [];
  private checking = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
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

      const now = Date.now();
      const lastCheck =
        this.context.globalState.get<number>(
          FlowTestEngineUpdateService.LAST_CHECK_KEY
        ) ?? 0;

      const defaultIntervalHours = vscode.workspace
        .getConfiguration("flowTestRunner", workspaceFolder.uri)
        .get<number>("interfaceUpdateIntervalHours", 6);

      const intervalMs = Math.max(defaultIntervalHours, 1) * 60 * 60 * 1000;
      if (!force && now - lastCheck < intervalMs) {
        return;
      }

      const config = vscode.workspace.getConfiguration(
        "flowTestRunner",
        workspaceFolder.uri
      );
      const command = config.get<string>("command", "flow-test-engine");
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
        this.compareSemver(versionInfo.latest, versionInfo.current) <= 0 ||
        this.context.globalState.get<string>(
          FlowTestEngineUpdateService.LAST_VERSION_KEY
        ) === versionInfo.latest
      ) {
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
    } catch (error) {
      console.warn("Failed to check Flow Test Engine updates:", error);
    } finally {
      this.checking = false;
    }
  }

  async updateInterfaces(
    command: string,
    workspacePath: string,
    targetVersion?: string
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      "flowTestRunner",
      vscode.Uri.file(workspacePath)
    );
    const template = config.get<string>(
      "interfaceUpdateCommand",
      "${command} schema --format=json"
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

    vscode.window.showInformationMessage(
      "Interfaces do Flow Test Engine sincronizadas com sucesso."
    );
  }

  getGeneratedInterfacePath(fileName?: string): vscode.Uri {
    const baseUri = vscode.Uri.joinPath(this.context.globalStorageUri, "engine");
    const target = fileName ?? "flow-test-engine.schema.json";
    return vscode.Uri.joinPath(baseUri, target);
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
