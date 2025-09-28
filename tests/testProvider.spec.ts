import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import path from "path";
import { FlowTestProvider, FlowTestItem } from "../src/testProvider";
import { FlowTestSuite } from "../src/models/types";
import { workspace, commands, Uri } from "vscode";

const createEventStub = () => {
  const listeners = new Set<(...args: any[]) => void>();
  const event = vi.fn((listener: (...args: any[]) => void) => {
    listeners.add(listener);
    return {
      dispose: () => listeners.delete(listener),
    };
  });
  return { event, listeners };
};

describe("FlowTestProvider", () => {
  beforeEach(() => {
    const workspaceMock = workspace as unknown as typeof workspace & {
      workspaceFolders: Array<{ uri: { fsPath: string }; name?: string }>;
      getWorkspaceFolder: Mock;
    };
    const workspacePath = path.join("/", "workspace");
    const folder = { uri: Uri.file(workspacePath), name: "workspace" };
    (
      workspaceMock.workspaceFolders as unknown as Array<{
        uri: { fsPath: string };
        name?: string;
      }>
    ).push(folder);
    workspaceMock.getWorkspaceFolder.mockReturnValue(folder);
  });

  it("organiza pastas e suites em ordem alfabetica", async () => {
    const workspacePath = path.join("/", "workspace");

    const suites: FlowTestSuite[] = [
      {
        name: "gamma-suite",
        suite_name: "Gamma Suite",
        filePath: path.join(workspacePath, "tests", "a-suite.yaml"),
        steps: [],
      },
      {
        name: "alpha-root",
        suite_name: "Alpha Root",
        filePath: path.join(workspacePath, "alpha.yaml"),
        steps: [],
      },
      {
        name: "beta-suite",
        suite_name: "Beta Suite",
        filePath: path.join(workspacePath, "tests", "b-suite.yaml"),
        steps: [],
      },
      {
        name: "delta-suite",
        suite_name: "Delta Suite",
        filePath: path.join(workspacePath, "tests", "sub", "c-suite.yaml"),
        steps: [],
      },
      {
        name: "report-suite",
        suite_name: "Report Suite",
        filePath: path.join(workspacePath, "reports", "z-suite.yaml"),
        steps: [],
      },
    ];

    const testScanner = {
      findTestFiles: vi.fn().mockResolvedValue(suites),
      onDidChangeTreeData: vi
        .fn()
        .mockImplementation(() => ({ dispose: vi.fn() })),
      refresh: vi.fn(),
    } as unknown as import("../src/testScanner").TestScanner;

    const testRunnerEvents = {
      onTestResult: createEventStub(),
      onSuiteResult: createEventStub(),
    };

    const testRunner = {
      onTestResult: testRunnerEvents.onTestResult.event,
      onSuiteResult: testRunnerEvents.onSuiteResult.event,
    } as unknown as import("../src/testRunner").TestRunner;

    const provider = new FlowTestProvider(testScanner, testRunner);

    const rootItems = (await provider.getChildren()) as FlowTestItem[];
    expect(
      rootItems.map((item) => ({ label: item.label, type: item.type }))
    ).toEqual([
      { label: "reports", type: "folder" },
      { label: "tests", type: "folder" },
      { label: "Alpha Root", type: "suite" },
    ]);

    const testsFolder = rootItems.find((item) => item.label === "tests")!;
    const testsChildren = (await provider.getChildren(
      testsFolder
    )) as FlowTestItem[];
    expect(
      testsChildren.map((item) => ({ label: item.label, type: item.type }))
    ).toEqual([
      { label: "sub", type: "folder" },
      { label: "Beta Suite", type: "suite" },
      { label: "Gamma Suite", type: "suite" },
    ]);

    const reportsFolder = rootItems.find((item) => item.label === "reports")!;
    const reportsChildren = (await provider.getChildren(
      reportsFolder
    )) as FlowTestItem[];
    expect(
      reportsChildren.map((item) => ({ label: item.label, type: item.type }))
    ).toEqual([{ label: "Report Suite", type: "suite" }]);

    const subFolder = testsChildren.find((item) => item.label === "sub")!;
    const subChildren = (await provider.getChildren(
      subFolder
    )) as FlowTestItem[];
    expect(
      subChildren.map((item) => ({ label: item.label, type: item.type }))
    ).toEqual([{ label: "Delta Suite", type: "suite" }]);

    expect(commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "flowTestRunner.filterActive",
      false
    );
  });
});
