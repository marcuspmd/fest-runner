import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import path from "path";
import { handleGenerateGraph } from "../src/extension";
import type { ConfigService } from "../src/services/configService";
import type { GraphService } from "../src/services/graphService";
import { workspace, window, Uri, commands } from "vscode";
import type { FlowTestConfig } from "../src/models/types";

describe("handleGenerateGraph", () => {
  const workspaceMock = workspace as typeof workspace & {
    workspaceFolders: Array<{ uri: { fsPath: string }; name?: string }>;
    openTextDocument: Mock;
  };
  const windowMock = window as typeof window & {
    showQuickPick: Mock;
    showInputBox: Mock;
    showSaveDialog: Mock;
    showInformationMessage: Mock;
    showTextDocument: Mock;
  };
  const commandsMock = commands as typeof commands & {
    executeCommand: Mock;
  };

  const workspacePath = path.join("/", "workspace");

  beforeEach(() => {
    workspaceMock.workspaceFolders.push({
      uri: Uri.file(workspacePath),
      name: "workspace",
    });
  });

  it("gera grafico com opcoes personalizadas e abre arquivo", async () => {
    const config: FlowTestConfig = {
      command: "flow-test-engine",
      outputFormat: "both",
      timeout: 1000,
      retryCount: 0,
      workingDirectory: workspacePath,
      testDirectories: [workspacePath],
      discovery: {
        patterns: ["**/*.yaml"],
        exclude: [],
      },
      interactiveInputs: true,
      graph: {
        defaultDirection: "TD",
        defaultOutput: "graphs/default.mmd",
        noOrphans: false,
      },
    };

    const configService = {
      getConfig: vi.fn().mockResolvedValue(config),
    } as unknown as ConfigService;

    const graphService = {
      generateMermaidGraph: vi.fn().mockResolvedValue({
        outputPath: path.join(workspacePath, "custom-graph.mmd"),
        command: "flow-test-engine",
        args: ["graph"],
      }),
    } as unknown as GraphService;

    windowMock.showSaveDialog.mockResolvedValueOnce(
      Uri.file(path.join(workspacePath, "custom-graph.mmd"))
    );
    windowMock.showQuickPick
      .mockResolvedValueOnce({
        label: "Left to right",
        description: "",
        value: "LR",
      })
      .mockResolvedValueOnce({
        label: "Yes",
        description: "",
        value: true,
      });
    windowMock.showInputBox
      .mockResolvedValueOnce("priority:login")
      .mockResolvedValueOnce("suite-a, suite-b")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("tag-one;tag-two")
      .mockResolvedValueOnce("My Graph");
    windowMock.showInformationMessage.mockResolvedValueOnce("Open");
    workspaceMock.openTextDocument.mockResolvedValueOnce({
      uri: { fsPath: path.join(workspacePath, "custom-graph.mmd") },
    });

    await handleGenerateGraph(graphService, configService);

    expect(graphService.generateMermaidGraph).toHaveBeenCalledTimes(1);
    expect(graphService.generateMermaidGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath,
        outputPath: path.join(workspacePath, "custom-graph.mmd"),
        direction: "LR",
        noOrphans: true,
        priority: ["priority:login"],
        suites: ["suite-a", "suite-b"],
        tags: ["tag-one", "tag-two"],
        title: "My Graph",
      })
    );

    expect(windowMock.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("custom-graph.mmd"),
      "Open",
      "Reveal"
    );
    expect(workspaceMock.openTextDocument).toHaveBeenCalledWith(
      Uri.file(path.join(workspacePath, "custom-graph.mmd"))
    );
    expect(windowMock.showTextDocument).toHaveBeenCalled();
  });

  it("nao executa comando quando usuario cancela selecao de arquivo", async () => {
    const configService = {
      getConfig: vi.fn().mockResolvedValue({
        command: "flow-test-engine",
        outputFormat: "both",
        timeout: 1000,
        retryCount: 0,
        workingDirectory: workspacePath,
        testDirectories: [workspacePath],
        discovery: {
          patterns: ["**/*.yaml"],
          exclude: [],
        },
        interactiveInputs: true,
      }),
    } as unknown as ConfigService;

    const graphService = {
      generateMermaidGraph: vi.fn(),
    } as unknown as GraphService;

    windowMock.showSaveDialog.mockResolvedValueOnce(undefined);

    await handleGenerateGraph(graphService, configService);

    expect(graphService.generateMermaidGraph).not.toHaveBeenCalled();
    expect(windowMock.showQuickPick).not.toHaveBeenCalled();
  });

  it("exibe erro quando geracao falha", async () => {
    const configService = {
      getConfig: vi.fn().mockResolvedValue({
        command: "flow-test-engine",
        outputFormat: "both",
        timeout: 1000,
        retryCount: 0,
        workingDirectory: workspacePath,
        testDirectories: [workspacePath],
        discovery: {
          patterns: ["**/*.yaml"],
          exclude: [],
        },
        interactiveInputs: true,
        graph: {
          defaultDirection: "TD",
          defaultOutput: "graph.mmd",
        },
      }),
    } as unknown as ConfigService;

    const graphService = {
      generateMermaidGraph: vi
        .fn()
        .mockRejectedValueOnce(new Error("graph failed")),
    } as unknown as GraphService;

    windowMock.showSaveDialog.mockResolvedValueOnce(
      Uri.file(path.join(workspacePath, "graph.mmd"))
    );
    windowMock.showQuickPick
      .mockResolvedValueOnce({
        label: "Default",
        description: "",
        value: undefined,
      })
      .mockResolvedValueOnce({
        label: "Default",
        description: "",
        value: undefined,
      });
    windowMock.showInputBox
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("");

    await handleGenerateGraph(graphService, configService);

    expect(windowMock.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("graph failed")
    );
    expect(windowMock.showInformationMessage).not.toHaveBeenCalled();
    expect(commandsMock.executeCommand).not.toHaveBeenCalledWith(
      "revealFileInOS",
      expect.anything()
    );
  });
});
