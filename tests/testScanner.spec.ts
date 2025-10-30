import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { TestScanner } from "../src/testScanner";
import { ConfigService } from "../src/services/configService";
import { workspace, Uri } from "vscode";

describe("TestScanner", () => {
  let tempDir: string;
  const workspaceFolder = { uri: Uri.file(""), name: "temp" };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-runner-"));
    workspaceFolder.uri = Uri.file(tempDir);
    const workspaceMock = workspace as unknown as typeof workspace & {
      workspaceFolders: Array<typeof workspaceFolder>;
      getWorkspaceFolder: Mock;
      findFiles: Mock;
    };
    (
      workspaceMock.workspaceFolders as unknown as Array<typeof workspaceFolder>
    ).push(workspaceFolder);
    workspaceMock.getWorkspaceFolder.mockReturnValue(workspaceFolder);
    workspaceMock.findFiles.mockResolvedValue([]);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("identifica suites com steps que usam call", async () => {
    const configMock = {
      getConfig: vi.fn().mockResolvedValue({
        command: "flow-test-engine",
        outputFormat: "both",
        timeout: 1000,
        retryCount: 0,
        workingDirectory: tempDir,
        testDirectories: [tempDir],
        discovery: {
          patterns: ["**/*.yaml"],
          exclude: [],
        },
      }),
      invalidateConfigForFile: vi.fn(),
      hasConfigFile: vi.fn().mockResolvedValue(true),
    } as unknown as ConfigService;

    const configSpy = vi
      .spyOn(ConfigService, "getInstance")
      .mockReturnValue(configMock as unknown as ConfigService);

    const suiteFile = path.join(tempDir, "call-suite.yaml");
    fs.writeFileSync(
      suiteFile,
      [
        "suite_name: Call Suite",
        "node_id: call-suite",
        "steps:",
        "  - name: Call Step",
        "    call:",
        "      test: ../shared/other-suite.yaml",
        "      step: called_step",
        "      isolate_context: true",
        "      on_error: warn",
      ].join("\n"),
      "utf8"
    );

    const workspaceMock = workspace as unknown as typeof workspace & {
      findFiles: Mock;
    };
    workspaceMock.findFiles.mockResolvedValue([Uri.file(suiteFile)]);

    const scanner = new TestScanner();
    try {
      const suites = await scanner.findTestFiles();
      expect(suites).toHaveLength(1);
      const suite = suites[0];
      expect(suite.filePath).toBe(path.normalize(suiteFile));
      expect(suite.steps).toHaveLength(1);
      const step = suite.steps[0];
      expect(step.call).toBeDefined();
      expect(step.call?.test).toBe("../shared/other-suite.yaml");
      expect(step.request).toBeUndefined();
    } finally {
      scanner.dispose();
      configSpy.mockRestore();
    }
  });
});
