import { beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import { commands, workspace, window } from "vscode";

type WorkspaceMock = typeof workspace & {
  workspaceFolders: Array<{ uri: { fsPath: string }; name?: string }> & {
    length: number;
    splice(start: number, deleteCount?: number): void;
    push: (
      ...items: Array<{ uri: { fsPath: string }; name?: string }>
    ) => number;
  };
  getWorkspaceFolder: Mock;
  findFiles: Mock;
  createFileSystemWatcher: Mock;
  getConfiguration: Mock;
  openTextDocument: Mock;
};

type WindowMock = typeof window & {
  showErrorMessage: Mock;
  showWarningMessage: Mock;
  showInformationMessage: Mock;
  withProgress: Mock;
  createOutputChannel: Mock;
  setStatusBarMessage: Mock;
  showQuickPick: Mock;
  showInputBox: Mock;
  showSaveDialog: Mock;
  showTextDocument: Mock;
};

type CommandsMock = typeof commands & {
  executeCommand: Mock;
};

const workspaceMock = workspace as unknown as WorkspaceMock;
const windowMock = window as unknown as WindowMock;
const commandsMock = commands as unknown as CommandsMock;

beforeEach(() => {
  workspaceMock.workspaceFolders.splice(
    0,
    workspaceMock.workspaceFolders.length
  );
  workspaceMock.getWorkspaceFolder.mockReset();
  workspaceMock.findFiles.mockReset();
  workspaceMock.createFileSystemWatcher.mockReset();
  workspaceMock.createFileSystemWatcher.mockImplementation(() => ({
    onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(),
  }));
  workspaceMock.getConfiguration.mockReset();
  workspaceMock.getConfiguration.mockReturnValue({ get: vi.fn() });
  workspaceMock.openTextDocument.mockReset();
  workspaceMock.openTextDocument.mockResolvedValue({ uri: { fsPath: "" } });

  windowMock.showErrorMessage.mockReset();
  windowMock.showWarningMessage.mockReset();
  windowMock.showInformationMessage.mockReset();
  windowMock.withProgress.mockReset();
  windowMock.withProgress.mockImplementation((_options, task) =>
    task({
      report: vi.fn(),
    })
  );
  windowMock.createOutputChannel.mockReset();
  windowMock.createOutputChannel.mockReturnValue({
    appendLine: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  });
  windowMock.setStatusBarMessage.mockReset();
  windowMock.showQuickPick.mockReset();
  windowMock.showInputBox.mockReset();
  windowMock.showSaveDialog.mockReset();
  windowMock.showTextDocument.mockReset();
  windowMock.showTextDocument.mockResolvedValue(undefined);

  commandsMock.executeCommand.mockReset();
});
