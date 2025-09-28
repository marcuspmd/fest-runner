import { vi } from "vitest";

export interface Disposable {
  dispose(): void;
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(value: T): void {
    for (const listener of Array.from(this.listeners)) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class TreeItem {
  id?: string;
  contextValue?: string;
  description?: string;
  iconPath?: ThemeIcon;
  tooltip?: string;
  resourceUri?: any;

  constructor(
    public readonly label: string,
    public collapsibleState: TreeItemCollapsibleState
  ) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
};

export class RelativePattern {
  constructor(public base: string, public pattern: string) {}
}

const defaultWatcher = () => ({
  onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  dispose: vi.fn(),
});

export const workspace = {
  workspaceFolders: [] as Array<{ uri: { fsPath: string }; name?: string }>,
  getWorkspaceFolder: vi.fn(),
  findFiles: vi.fn(),
  createFileSystemWatcher: vi.fn().mockImplementation(defaultWatcher),
  RelativePattern,
  getConfiguration: vi.fn().mockReturnValue({ get: vi.fn() }),
  openTextDocument: vi.fn(),
};

export const window = {
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  withProgress: vi.fn(),
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }),
  setStatusBarMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showSaveDialog: vi.fn(),
  showTextDocument: vi.fn(),
};

export const commands = {
  executeCommand: vi.fn(),
};

export const ProgressLocation = {
  Notification: 15,
};

export const workspaceFolders = workspace.workspaceFolders;

export interface WorkspaceFolder {
  uri: { fsPath: string };
  name?: string;
}

export interface WorkspaceConfiguration {
  get<T>(section: string): T | undefined;
}

export type FileSystemWatcher = ReturnType<typeof defaultWatcher>;

export default {
  EventEmitter,
  ThemeIcon,
  ThemeColor,
  TreeItem,
  TreeItemCollapsibleState,
  workspace,
  window,
  commands,
  Uri,
  RelativePattern,
  ProgressLocation,
};
