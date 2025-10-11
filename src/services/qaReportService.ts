import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { pathToFileURL } from "url";
import { ConfigService } from "./configService";
import { FlowTestConfig, TestExecutionState } from "../models/types";

interface QaReportData {
  executive_summary?: QaExecutiveSummary;
  test_cases?: QaTestCase[];
  metrics?: QaMetrics;
  issues?: QaIssue[];
  performance?: QaPerformance;
  report_metadata?: QaReportMetadata;
  format?: string;
}

interface QaExecutiveSummary {
  project_name?: string;
  test_run_date?: string;
  test_run_time?: string;
  overall_status?: string;
  total_test_suites?: number;
  passed_suites?: number;
  failed_suites?: number;
  skipped_suites?: number;
  success_rate?: string;
  total_duration?: string;
  total_duration_ms?: number;
  project_version?: string;
  owner?: string;
  environment?: string;
  testing_window?: string;
  objective?: string;
}

interface QaTestCase {
  test_case_id?: string;
  suite_name?: string;
  description?: string;
  priority?: string;
  status?: string;
  duration?: string;
  duration_ms?: number;
  steps?: QaStep[];
  file_path?: string;
  executed_at?: string;
  steps_total?: number;
  steps_passed?: number;
  steps_failed?: number;
  step_success_rate?: string;
}

interface QaStep {
  step_number?: number;
  step_id?: string;
  step_name?: string;
  status?: string;
  type?: string;
  duration?: string;
  duration_ms?: number;
  request?: QaRequest;
  response?: QaResponse;
  assertions?: QaAssertion[];
  variables_captured?: Record<string, unknown>;
}

interface QaRequest {
  method?: string;
  url?: string;
  full_url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  curl_command?: string;
}

interface QaResponse {
  status_code?: number;
  status_text?: string;
  size?: string;
  headers?: Record<string, string>;
  body?: unknown;
  response_time_ms?: number;
}

interface QaAssertion {
  description?: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
  passed?: boolean;
  message?: string;
}

interface QaIssue {
  severity?: string;
  test_case_id?: string;
  suite_name?: string;
  step_name?: string;
  step_number?: number;
  error_message?: string;
  category?: string;
  occurred_at?: string;
  file_path?: string;
}

interface QaMetrics {
  total_test_suites?: number;
  total_test_steps?: number;
  suites_passed?: number;
  suites_failed?: number;
  suites_skipped?: number;
  suites_success_rate?: string;
  steps_passed?: number;
  steps_failed?: number;
  steps_skipped?: number;
  steps_success_rate?: string;
  total_duration_ms?: number;
  average_suite_duration_ms?: number;
  average_step_duration_ms?: number;
  by_priority?: Record<
    string,
    {
      total?: number;
      passed?: number;
      failed?: number;
      success_rate?: string;
    }
  >;
  by_status?: Record<string, number>;
}

interface QaPerformance {
  total_requests?: number;
  average_response_time_ms?: number;
  min_response_time_ms?: number;
  max_response_time_ms?: number;
  requests_per_second?: number;
  slowest_endpoints?: Array<{
    url?: string;
    average_time_ms?: number;
    call_count?: number;
  }>;
  performance_rating?: string;
}

interface QaReportMetadata {
  generated_at?: string;
  format?: string;
  version?: string;
  run_id?: string;
  description?: string;
}

interface QaReportLocation {
  path: string;
  data: QaReportData;
}

interface QaReportBuildResult {
  htmlPath: string;
  sourcePath: string;
  workspacePath: string;
  pdfPath?: string | null;
}

interface DerivedReportContext {
  responsible?: string;
  buildVersion?: string;
  environment?: string;
  objective?: string;
}

interface RenderContext {
  sourcePath: string;
  workspacePath?: string;
}

export class QaReportService implements vscode.Disposable {
  private static instance: QaReportService;
  private configService = ConfigService.getInstance();

  private constructor() {}

  static getInstance(): QaReportService {
    if (!QaReportService.instance) {
      QaReportService.instance = new QaReportService();
    }
    return QaReportService.instance;
  }

  dispose(): void {
    // No-op for now; kept for symmetry with other services.
  }

  async generateHtmlReportForWorkspace(
    workspacePath: string,
    config?: FlowTestConfig
  ): Promise<QaReportBuildResult | null> {
    try {
      const result = await this.buildHtmlReport(workspacePath, config);
      if (!result) {
        vscode.window.showWarningMessage(
          "Nenhum relatório QA encontrado no diretório de resultados configurado."
        );
        return null;
      }

      await this.openHtmlDocument(result.htmlPath);
      await this.showReportMessage(result);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Falha ao gerar relatório QA em HTML: ${message}`
      );
      throw error;
    }
  }

  async generateFromExecutionState(
    state: TestExecutionState
  ): Promise<QaReportBuildResult | null> {
    const suiteUri = vscode.Uri.file(state.suitePath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(suiteUri);
    const workspacePath =
      workspaceFolder?.uri.fsPath ?? path.dirname(state.suitePath);
    return this.generateHtmlReportForWorkspace(workspacePath, state.config);
  }

  private async openHtmlDocument(htmlPath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(htmlPath)
    );
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
  }

  private async showReportMessage(
    result: QaReportBuildResult
  ): Promise<void> {
    const htmlUri = vscode.Uri.file(result.htmlPath);
    const htmlDisplay = this.toDisplayPath(
      result.htmlPath,
      result.workspacePath
    );
    const pdfDisplay =
      result.pdfPath &&
      this.toDisplayPath(result.pdfPath, result.workspacePath);
    const actions: string[] = ["Revelar HTML"];

    if (result.pdfPath) {
      actions.push("Abrir PDF", "Revelar PDF");
    }

    const message = result.pdfPath
      ? `Relatório QA gerado.\nHTML: ${htmlDisplay}\nPDF: ${pdfDisplay}`
      : `Relatório QA gerado.\nHTML: ${htmlDisplay}`;

    const selection = await vscode.window.showInformationMessage(
      message,
      ...actions
    );

    if (selection === "Revelar HTML") {
      await vscode.commands.executeCommand("revealFileInOS", htmlUri);
      return;
    }

    if (!result.pdfPath) {
      return;
    }

    const pdfUri = vscode.Uri.file(result.pdfPath);
    if (selection === "Abrir PDF") {
      await vscode.env.openExternal(pdfUri);
    } else if (selection === "Revelar PDF") {
      await vscode.commands.executeCommand("revealFileInOS", pdfUri);
    }
  }

  private async buildHtmlReport(
    workspacePath: string,
    config?: FlowTestConfig
  ): Promise<QaReportBuildResult | null> {
    const configToUse =
      config ?? (await this.configService.getConfig(workspacePath));

    const workingDir = configToUse.workingDirectory ?? workspacePath;
    const outputDirRaw = configToUse.reporting?.outputDir ?? "results";
    const outputDir = path.isAbsolute(outputDirRaw)
      ? path.normalize(outputDirRaw)
      : path.normalize(path.resolve(workingDir, outputDirRaw));

    const locatedReport = await this.locateQaReport(outputDir);
    if (!locatedReport) {
      return null;
    }

    const htmlPath = this.resolveHtmlOutputPath(locatedReport.path);
    await fs.promises.mkdir(path.dirname(htmlPath), { recursive: true });

    const renderContext: RenderContext = {
      sourcePath: locatedReport.path,
      workspacePath,
    };

    const derivedContext = await this.resolveDerivedContext(
      workspacePath,
      locatedReport.data
    );

    const htmlContent = this.renderHtml(locatedReport.data, renderContext, {
      derived: derivedContext,
    });

    await fs.promises.writeFile(htmlPath, htmlContent, "utf8");
    const pdfPath = await this.generatePdfFromHtml(
      locatedReport.data,
      renderContext,
      htmlPath,
      path.dirname(locatedReport.path),
      configToUse,
      derivedContext
    );
    return {
      htmlPath,
      sourcePath: locatedReport.path,
      workspacePath,
      pdfPath: pdfPath ?? undefined,
    };
  }

  private async locateQaReport(baseDir: string): Promise<QaReportLocation | null> {
    const candidatePaths = [
      path.join(baseDir, "latest-qa.json"),
      path.join(baseDir, "qa", "latest.json"),
      path.join(baseDir, "qa", "latest-qa.json"),
      path.join(baseDir, "latest.json"),
    ];

    for (const candidate of candidatePaths) {
      const data = await this.loadQaReport(candidate);
      if (data) {
        return { path: candidate, data };
      }
    }

    const searchDirs = new Set<string>([
      baseDir,
      path.join(baseDir, "qa"),
      path.join(baseDir, "reports"),
      path.join(baseDir, "qa", "reports"),
    ]);

    const candidates: Array<{ path: string; mtime: number }> = [];

    for (const dir of searchDirs) {
      const stat = await this.tryStat(dir);
      if (!stat || !stat.isDirectory()) {
        continue;
      }

      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith(".json")) {
          continue;
        }
        const fullPath = path.join(dir, entry);
        const fileStat = await this.tryStat(fullPath);
        if (!fileStat || !fileStat.isFile()) {
          continue;
        }
        candidates.push({ path: fullPath, mtime: fileStat.mtimeMs });
      }
    }

    candidates.sort((a, b) => b.mtime - a.mtime);

    for (const entry of candidates) {
      const data = await this.loadQaReport(entry.path);
      if (data) {
        return { path: entry.path, data };
      }
    }

    return null;
  }

  private async loadQaReport(filePath: string): Promise<QaReportData | null> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch {
      return null;
    }

    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (this.isQaReport(parsed)) {
        return parsed as QaReportData;
      }
      return null;
    } catch {
      return null;
    }
  }

  private isQaReport(data: any): data is QaReportData {
    if (!data || typeof data !== "object") {
      return false;
    }

    const metadataFormat =
      typeof data.report_metadata?.format === "string"
        ? data.report_metadata.format
        : undefined;
    const altFormat =
      typeof data.format === "string" ? data.format : undefined;

    const format = metadataFormat ?? altFormat;
    return typeof format === "string" && format.toLowerCase() === "qa";
  }

  private resolveHtmlOutputPath(reportPath: string): string {
    const parsed = path.parse(reportPath);
    const baseName = parsed.name.endsWith("-qa")
      ? parsed.name
      : `${parsed.name}-qa`;
    return path.join(parsed.dir, `${baseName}.html`);
  }

  private resolvePdfOutputPath(
    htmlPath: string,
    reportDir: string,
    config: FlowTestConfig
  ): string {
    const parsed = path.parse(htmlPath);
    const baseName = parsed.name;

    const pdfSubdir = config.reporting?.pdf?.outputSubdir;
    const targetDir = pdfSubdir
      ? path.isAbsolute(pdfSubdir)
        ? path.normalize(pdfSubdir)
        : path.normalize(path.resolve(reportDir, pdfSubdir))
      : path.dirname(htmlPath);

    return path.join(targetDir, `${baseName}.pdf`);
  }

  private async generatePdfFromHtml(
    data: QaReportData,
    renderContext: RenderContext,
    htmlPath: string,
    reportDir: string,
    config: FlowTestConfig,
    derived: DerivedReportContext
  ): Promise<string | null> {
    const executablePath = await this.resolveBrowserExecutable(config);
    if (!executablePath) {
      vscode.window.showWarningMessage(
        "Relatório QA em HTML gerado, mas o PDF não pôde ser criado automaticamente. Configure 'flowTestRunner.pdfBrowserExecutable' com o caminho de um Chrome/Chromium instalado."
      );
      return null;
    }

    let puppeteer: typeof import("puppeteer-core");
    try {
      puppeteer = await import("puppeteer-core");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(
        `Dependência 'puppeteer-core' não disponível para geração de PDF: ${message}`
      );
      return null;
    }

    const pdfPath = this.resolvePdfOutputPath(htmlPath, reportDir, config);
    try {
      await fs.promises.mkdir(path.dirname(pdfPath), { recursive: true });
    } catch {
      // Ignore directory creation failures; pdf generation will surface later.
    }

    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "qa-report-")
    );
    const tempHtmlPath = path.join(tempDir, path.basename(htmlPath));
    const truncatedHtml = this.renderHtml(data, renderContext, {
      maxResponseLines: 40,
      derived,
    });

    await fs.promises.writeFile(tempHtmlPath, truncatedHtml, "utf8");

    const fileUrl = pathToFileURL(tempHtmlPath).toString();
    let browser: import("puppeteer-core").Browser | null = null;

    try {
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      });

      const page = await browser.newPage();
      await page.goto(fileUrl, { waitUntil: "networkidle0" });
      await page.emulateMediaType("print");
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          bottom: "20mm",
          left: "15mm",
          right: "15mm",
        },
      });

      return pdfPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(
        `Falha ao gerar PDF do relatório QA: ${message}`
      );
      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private renderHtml(
    data: QaReportData,
    context: RenderContext,
    options?: { maxResponseLines?: number; derived?: DerivedReportContext }
  ): string {
    const summary = data.executive_summary ?? {};
    const testCases = Array.isArray(data.test_cases) ? data.test_cases : [];
    const metrics = data.metrics ?? {};
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const performance = data.performance;
    const metadata = data.report_metadata ?? {};

    const derived = options?.derived ?? {};

    const runDate = this.formatDate(summary.test_run_date);
    const runTime = summary.test_run_time ?? "—";
    const totalDuration = summary.total_duration
      ? summary.total_duration
      : this.formatDuration(summary.total_duration_ms ?? metrics.total_duration_ms);
    const successRate =
      summary.success_rate ??
      metrics.steps_success_rate ??
      metrics.suites_success_rate ??
      "—";

    const status = summary.overall_status ?? "UNKNOWN";

    const generatedAt = this.formatDateTime(metadata.generated_at);
    const translatedMetadataDescription = this.translateObjectiveText(
      metadata.description
    );
    const reportDescription =
      translatedMetadataDescription ??
      metadata.description ??
      derived.objective ??
      "Relatório QA gerado pelo Flow Test Runner.";

    const defaultObjective =
      "Relatório orientado para equipes de QA/testers, adequado para documentação e geração em HTML/PDF.";
    const objective =
      summary.objective ??
      derived.objective ??
      translatedMetadataDescription ??
      defaultObjective;

    const buildVersion = summary.project_version ?? derived.buildVersion;
    const responsible = summary.owner ?? derived.responsible;
    const environment = summary.environment ?? derived.environment;

    const sourceDisplayPath = this.toDisplayPath(
      context.sourcePath,
      context.workspacePath
    );

    const testCaseRows = this.renderTestCaseRows(
      testCases,
      context.workspacePath
    );
    const stepRows = this.renderStepRows(testCases);
    const curlSections = this.renderCurlSections(
      testCases,
      options?.maxResponseLines,
      context.workspacePath
    );
    const issuesSection = this.renderIssuesSection(issues);
    const performanceSection = this.renderPerformanceSection(performance);

    const totalSuites =
      summary.total_test_suites ?? metrics.total_test_suites ?? testCases.length;
    const suitesPassed =
      summary.passed_suites ?? metrics.suites_passed ?? testCases.length;
    const suitesFailed =
      summary.failed_suites ?? metrics.suites_failed ?? 0;
    const suitesSkipped =
      summary.skipped_suites ?? metrics.suites_skipped ?? 0;

    const totalSteps =
      metrics.total_test_steps ??
      testCases.reduce(
        (acc, testCase) => acc + ((testCase.steps?.length as number) ?? 0),
        0
      );
    const stepsPassed = metrics.steps_passed ?? totalSteps;
    const stepsFailed = metrics.steps_failed ?? 0;
    const stepsSkipped = metrics.steps_skipped ?? 0;

    const prioritySummary = this.renderPrioritySummary(metrics.by_priority);

    const allTestsPassed =
      suitesFailed === 0 &&
      stepsFailed === 0 &&
      testCases.every(
        (testCase) => (testCase.status ?? "").toLowerCase() !== "failed"
      );

    const statusBadgeClass = allTestsPassed
      ? "badge-success"
      : this.resolveStatusClass(status);
    const statusLabel = status.toUpperCase();
    const finalStatusMessage = allTestsPassed
      ? "✅ Aprovado para implantação"
      : "⚠️ Em atenção";

    const projectInfoLines = [
      `<p><strong>Nome:</strong> ${this.escapeHtml(
        summary.project_name ?? "Não informado"
      )}</p>`,
    ];

    if (buildVersion) {
      projectInfoLines.push(
        `<p><strong>Versão / Build:</strong> ${this.escapeHtml(buildVersion)}</p>`
      );
    }

    if (responsible) {
      projectInfoLines.push(
        `<p><strong>Responsável:</strong> ${this.escapeHtml(responsible)}</p>`
      );
    }

    const executionInfoLines = [
      `<p><strong>Data do Relatório:</strong> ${this.escapeHtml(runDate)}</p>`,
      `<p><strong>Horário de Execução:</strong> ${this.escapeHtml(runTime)}</p>`,
    ];

    if (environment) {
      executionInfoLines.push(
        `<p><strong>Ambiente:</strong> ${this.escapeHtml(environment)}</p>`
      );
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório QA - ${this.escapeHtml(
      summary.project_name ?? "Flow Test Runner"
    )}</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Segoe UI", Roboto, Oxygen, sans-serif;
        --primary: #003366;
        --accent: #1e88e5;
        --success: #2e7d32;
        --warning: #ef6c00;
        --danger: #c62828;
        --muted: #6b7280;
        --border: #d1d5db;
      }

      @media print {
        a {
          color: var(--primary);
          text-decoration: none;
        }
        body {
          font-size: 11pt;
        }
        .page-break {
          page-break-before: always;
        }
      }

      body {
        margin: 0 auto;
        padding: 32px;
        max-width: 1080px;
        background: #f8fafc;
        color: #111827;
      }

      header {
        border-bottom: 4px solid var(--primary);
        margin-bottom: 32px;
        padding-bottom: 16px;
      }

      h1 {
        margin: 0;
        font-size: 2.2rem;
        color: var(--primary);
      }

      h2 {
        margin-top: 32px;
        color: var(--accent);
        border-bottom: 2px solid rgba(30, 136, 229, 0.2);
        padding-bottom: 6px;
      }

      h3 {
        margin-top: 24px;
        color: var(--primary);
      }

      p {
        line-height: 1.6;
        margin: 6px 0;
      }

      ul {
        margin: 8px 0 16px;
        padding-left: 20px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        background: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
      }

      th,
      td {
        padding: 10px 12px;
        border: 1px solid rgba(209, 213, 219, 0.7);
        text-align: left;
        vertical-align: top;
      }

      table.subtable {
        margin: 12px 0 4px;
        font-size: 0.95rem;
        width: 100%;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
        background: #ffffff;
      }

      table.subtable th,
      table.subtable td {
        padding: 8px 10px;
        border: 1px solid rgba(209, 213, 219, 0.6);
        vertical-align: top;
        background: #f9fafb;
      }

      .value-block {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        background: rgba(148, 163, 184, 0.16);
        padding: 4px 6px;
        border-radius: 6px;
        margin-top: 4px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      th {
        background: rgba(30, 136, 229, 0.08);
        color: var(--primary);
        font-weight: 600;
      }

      td.status {
        font-weight: 600;
      }

      td.passed {
        color: var(--success);
      }

      td.failed {
        color: var(--danger);
      }

      .badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .badge-success {
        background: rgba(46, 125, 50, 0.12);
        color: var(--success);
      }

      .badge-warning {
        background: rgba(239, 108, 0, 0.12);
        color: var(--warning);
      }

      .badge-danger {
        background: rgba(198, 40, 40, 0.12);
        color: var(--danger);
      }

      .grid {
        display: grid;
        gap: 18px;
      }

      .grid.two {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .card {
        background: #ffffff;
        border-radius: 12px;
        padding: 18px 20px;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.18);
      }

      .card h3 {
        margin-top: 0;
      }

      .muted {
        color: var(--muted);
      }

      .muted-small {
        color: var(--muted);
        font-size: 0.8rem;
      }

      .highlight {
        font-weight: 600;
        color: var(--accent);
      }

      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        background: none;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85rem;
        word-break: break-word;
        white-space: pre-wrap;
      }

      pre {
        background: rgba(15, 23, 42, 0.92);
        color: #f3f4f6;
        padding: 12px 16px;
        border-radius: 8px;
        overflow-x: auto;
        font-size: 0.85rem;
        line-height: 1.5;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.25);
        margin: 12px 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .section-note {
        background: rgba(30, 136, 229, 0.06);
        border-left: 4px solid var(--accent);
        padding: 12px 16px;
        margin: 12px 0;
        border-radius: 8px;
      }

      footer {
        margin-top: 48px;
        text-align: center;
        font-size: 0.85rem;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Relatório QA / Tester</h1>
      <p class="muted">Gerado em ${this.escapeHtml(generatedAt)}</p>
      <span class="badge ${statusBadgeClass}">Status Geral: ${this.escapeHtml(
      statusLabel
    )}</span>
    </header>

    <section id="informacoes-gerais">
      <h2>1. Informações Gerais</h2>
      <div class="grid two">
        <div class="card">
          <h3>Projeto</h3>
          ${projectInfoLines.join("\n")}
        </div>
        <div class="card">
          <h3>Janela de Execução</h3>
          ${executionInfoLines.join("\n")}
        </div>
      </div>
      <div class="section-note">
        <p>
          <strong>Objetivo:</strong> ${this.escapeHtml(objective)}
        </p>
      </div>
    </section>

    <section id="escopo">
      <h2>2. Escopo dos Testes</h2>
      <div class="grid two">
        <div class="card">
          <h3>Funcionalidades Cobertas</h3>
          <ul>
            ${this.renderCoveredFunctionalities(testCases)}
          </ul>
        </div>
        <div class="card">
          <h3>Fora do Escopo</h3>
          <p class="muted">
            Não foram analisadas funcionalidades adicionais além das listadas acima.
          </p>
        </div>
      </div>
      <h3>Tipos de Teste Realizados</h3>
      <ul>
        <li>Teste funcional automatizado</li>
        <li>Teste de integração de API (Flow Test Engine)</li>
        <li>Validações automatizadas via assertions JSON</li>
      </ul>
    </section>

    <section id="cenarios">
      <h2>3. Cenários e Casos de Teste</h2>
      <h3>Resumo Quantitativo</h3>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Total</th>
            <th>Executados</th>
            <th>Aprovados</th>
            <th>Reprovados</th>
            <th>Bloqueados</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Suites</td>
            <td>${this.formatNumber(totalSuites)}</td>
            <td>${this.formatNumber(totalSuites)}</td>
            <td class="passed">${this.formatNumber(suitesPassed)}</td>
            <td class="failed">${this.formatNumber(suitesFailed)}</td>
            <td>${this.formatNumber(suitesSkipped)}</td>
          </tr>
          <tr>
            <td>Steps</td>
            <td>${this.formatNumber(totalSteps)}</td>
            <td>${this.formatNumber(totalSteps)}</td>
            <td class="passed">${this.formatNumber(stepsPassed)}</td>
            <td class="failed">${this.formatNumber(stepsFailed)}</td>
            <td>${this.formatNumber(stepsSkipped)}</td>
          </tr>
        </tbody>
      </table>

      ${prioritySummary}

      <h3>Casos de Teste Detalhados</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Suite</th>
            <th>Descrição</th>
            <th>Prioridade</th>
            <th>Status</th>
            <th>Duração</th>
          </tr>
        </thead>
        <tbody>
          ${testCaseRows}
        </tbody>
      </table>

      <h3>Detalhes dos Steps</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Duração</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          ${stepRows}
        </tbody>
      </table>
    </section>

    <section id="curl-evidence">
      <h2>4. Evidências de Requisição e Resposta</h2>
      ${curlSections}
    </section>

    <section id="defeitos">
      <h2>5. Defeitos Encontrados</h2>
      ${issuesSection}
      <div class="section-note">
        <strong>Severidades recomendadas:</strong>
        <ul>
          <li>Crítica: impede o uso do sistema.</li>
          <li>Alta: impacta funcionalidade principal.</li>
          <li>Média: comportamento incorreto com alternativa.</li>
          <li>Baixa: cosmético ou texto incorreto.</li>
        </ul>
      </div>
    </section>

    <section id="resultados">
      <h2>6. Resultados e Conclusões</h2>
      <p>
        <strong>Taxa de aprovação geral:</strong>
        <span class="highlight">${this.escapeHtml(successRate)}</span>
      </p>
      <ul>
        <li>Total de suites executadas: ${this.formatNumber(totalSuites)}</li>
        <li>Total de steps executados: ${this.formatNumber(totalSteps)}</li>
        <li>Duração total: ${this.escapeHtml(totalDuration)}</li>
        <li>Bugs críticos encontrados: ${issues.filter((issue) =>
          (issue.severity ?? "").toLowerCase() === "critical"
        ).length}</li>
        <li>Status geral: ${finalStatusMessage}</li>
      </ul>
      ${performanceSection}
    </section>

    <section id="evidencias">
      <h2>7. Evidências</h2>
      <ul>
        <li>Relatório QA (JSON): <code>${this.escapeHtml(
          sourceDisplayPath
        )}</code></li>
        ${
          metadata.run_id
            ? `<li>Execução identificada por: <code>${this.escapeHtml(
                metadata.run_id
              )}</code></li>`
            : ""
        }
        <li>Formato: ${this.escapeHtml(
          metadata.format ?? "qa"
        )} (${this.escapeHtml(metadata.version ?? "v1")})</li>
        <li>Descrição do relatório: ${this.escapeHtml(reportDescription)}</li>
      </ul>
      <p class="muted">
        Imagens, capturas de tela ou anexos adicionais podem ser incluídos neste espaço
        para auditorias futuras.
      </p>
    </section>

    <section id="recomendacoes">
      <h2>8. Recomendações</h2>
      <ul>
        <li>
          Monitorar continuamente a latência dos endpoints críticos para garantir
          tempos de resposta abaixo das metas estabelecidas.
        </li>
        <li>
          Expandir os cenários negativos (credenciais inválidas, usuário bloqueado)
          para reforçar a cobertura do fluxo de autenticação.
        </li>
        <li>
          Considerar a exportação automática deste relatório em PDF via pipeline de CI
          para facilitar anexos em auditorias e aprovações executivas.
        </li>
      </ul>
    </section>

    <footer>
      Relatório gerado automaticamente pelo Flow Test Runner — ${this.escapeHtml(
        runDate
      )}
    </footer>
  </body>
</html>`;

    return html;
  }

  private renderTestCaseRows(
    testCases: QaTestCase[],
    workspacePath?: string
  ): string {
    if (testCases.length === 0) {
      return `<tr><td colspan="6" class="muted">Nenhum caso de teste registrado.</td></tr>`;
    }

    return testCases
      .map((testCase) => {
        const status = (testCase.status ?? "").toLowerCase();
        const statusClass =
          status === "passed" ? "passed" : status === "failed" ? "failed" : "";
        const duration =
          testCase.duration ??
          this.formatDuration(testCase.duration_ms) ??
          "—";
        const rawFilePath = testCase.file_path
          ? this.toDisplayPath(testCase.file_path, workspacePath)
          : undefined;
        const filePath = rawFilePath ? this.escapeHtml(rawFilePath) : "";
        const description = this.escapeHtml(testCase.description ?? "—");
        const fileLine = filePath
          ? `<div class="muted-small">${filePath}</div>`
          : "";
        const suiteName = this.escapeHtml(testCase.suite_name ?? "—");
        const testCaseId = this.escapeHtml(testCase.test_case_id ?? "—");
        const priority = this.escapeHtml(
          this.capitalize(testCase.priority) ?? "—"
        );
        const statusLabel = this.escapeHtml(
          (testCase.status ?? "—").toUpperCase()
        );
        const durationDisplay = this.escapeHtml(duration);

        return `<tr>
          <td><code>${testCaseId}</code></td>
          <td>${suiteName}</td>
          <td>${description}${fileLine}</td>
          <td>${priority}</td>
          <td class="status ${statusClass}">${statusLabel}</td>
          <td>${durationDisplay}</td>
        </tr>`;
      })
      .join("\n");
  }

  private renderStepRows(testCases: QaTestCase[]): string {
    const rows: string[] = [];

    for (const testCase of testCases) {
      const steps = Array.isArray(testCase.steps) ? testCase.steps : [];
      for (const step of steps) {
        const status = (step.status ?? "").toLowerCase();
        const statusClass =
          status === "passed" ? "passed" : status === "failed" ? "failed" : "";
        const duration =
          step.duration ?? this.formatDuration(step.duration_ms) ?? "—";

        const notes: string[] = [];
        if (step.variables_captured && Object.keys(step.variables_captured).length > 0) {
          const variables = Object.keys(step.variables_captured)
            .map((key) => `<code>${this.escapeHtml(key)}</code>`)
            .join(", ");
          notes.push(`Variáveis capturadas: ${variables}`);
        }

        const assertions = Array.isArray(step.assertions)
          ? step.assertions
          : [];
        if (assertions.length > 0) {
          const passedCount = assertions.filter((assert) => assert.passed).length;
          notes.push(
            `Validações: ${passedCount}/${assertions.length} aprovadas`
          );
        }

        if (step.request) {
          notes.push(
            `Requisição ${this.escapeHtml(
              (step.request.method ?? "GET").toUpperCase()
            )} ${this.escapeHtml(step.request.url ?? step.request.full_url ?? "")}`
          );
        }

        const noteContent =
          notes.length > 0 ? notes.join("<br/>") : "<span class=\"muted\">—</span>";

        const baseRow = `<tr>
          <td>${this.escapeHtml(
            String(step.step_number ?? step.step_id ?? "—")
          )}</td>
          <td>${this.escapeHtml(step.step_name ?? step.step_id ?? "—")}</td>
          <td>${this.escapeHtml(step.type ?? "—")}</td>
          <td class="status ${statusClass}">${this.escapeHtml(
          (step.status ?? "—").toUpperCase()
        )}</td>
          <td>${this.escapeHtml(duration)}</td>
          <td>${noteContent}</td>
        </tr>`;

        rows.push(baseRow);

        const assertionsTable = this.renderStepAssertionsTable(step.assertions);
        if (assertionsTable) {
          rows.push(
            `<tr class="step-assertions"><td colspan="6">${assertionsTable}</td></tr>`
          );
        }
      }
    }

    if (rows.length === 0) {
      return `<tr><td colspan="6" class="muted">Nenhum step registrado.</td></tr>`;
    }

    return rows.join("\n");
  }

  private renderCurlSections(
    testCases: QaTestCase[],
    maxResponseLines?: number,
    workspacePath?: string
  ): string {
    const cards: string[] = [];

    for (const testCase of testCases) {
      const steps = Array.isArray(testCase.steps) ? testCase.steps : [];
      for (const step of steps) {
        if (!step.request || !step.response) {
          continue;
        }
        const title = `${
          testCase.test_case_id ?? testCase.suite_name ?? "Teste"
        } — ${step.step_name ?? step.step_id ?? `Step ${step.step_number ?? ""}`}`;
        const requestCurl = this.formatCurlCommand(step.request);
        const responseDump = this.formatCurlResponse(
          step.response,
          maxResponseLines
        );
        const fileDisplay = testCase.file_path
          ? this.escapeHtml(
              this.toDisplayPath(testCase.file_path, workspacePath)
            )
          : "";
        const fileLine = fileDisplay
          ? `<p><strong>Arquivo:</strong> <code>${fileDisplay}</code></p>`
          : "";

        cards.push(`<div class="card">
          <h3>${this.escapeHtml(title)}</h3>
          ${fileLine}
          <p><strong>cURL Request:</strong></p>
          <pre><code>${this.escapeHtml(requestCurl)}</code></pre>
          <p><strong>Resposta:</strong></p>
          <pre><code>${this.escapeHtml(responseDump)}</code></pre>
        </div>`);
      }
    }

    if (cards.length === 0) {
      return `<p class="muted">Nenhuma requisição HTTP registrada nos steps analisados.</p>`;
    }

    return cards.join("\n");
  }

  private renderStepAssertionsTable(assertions?: QaAssertion[]): string {
    if (!Array.isArray(assertions) || assertions.length === 0) {
      return "";
    }

    const rows = assertions
      .map((assertion, index) => {
        const expectedRaw = this.formatAssertionValue(assertion.expected);
        const actualRaw = this.formatAssertionValue(assertion.actual);
        const expected = this.escapeHtml(
          this.truncateText(expectedRaw)
        );
        const actual = this.escapeHtml(this.truncateText(actualRaw));
        const message = assertion.message
          ? this.escapeHtml(this.truncateText(assertion.message, 160))
          : "—";
        const statusLabel = assertion.passed ? "PASSED" : "FAILED";
        const statusClass = assertion.passed ? "passed" : "failed";

        const fieldName = this.escapeHtml(assertion.field ?? "—");
        const description = assertion.description
          ? `<div class="muted-small">${this.escapeHtml(
              this.truncateText(assertion.description, 160)
            )}</div>`
          : "";

        return `<tr>
          <td>${index + 1}</td>
          <td><div><code>${fieldName}</code></div>${description}</td>
          <td><div class="value-block">${expected}</div></td>
          <td><div class="value-block">${actual}</div></td>
          <td class="status ${statusClass}">${statusLabel}</td>
          <td>${message}</td>
        </tr>`;
      })
      .join("\n");

    return `<table class="subtable">
      <thead>
        <tr>
          <th>#</th>
          <th>Campo / Assertiva</th>
          <th>Esperado</th>
          <th>Atual</th>
          <th>Status</th>
          <th>Mensagem</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

  private renderIssuesSection(issues: QaIssue[]): string {
    if (!issues.length) {
      return `<p>Nenhum defeito foi registrado nesta execução. Recomenda-se manter a monitoração contínua em novas iterações.</p>`;
    }

    const rows = issues
      .map((issue) => {
        return `<tr>
          <td>${this.escapeHtml(
            (issue.severity ?? "—").toUpperCase()
          )}</td>
          <td>${this.escapeHtml(issue.test_case_id ?? "—")}</td>
          <td>${this.escapeHtml(issue.suite_name ?? "—")}</td>
          <td>${this.escapeHtml(issue.step_name ?? "—")}</td>
          <td>${this.escapeHtml(
            issue.step_number !== undefined ? String(issue.step_number) : "—"
          )}</td>
          <td>${this.escapeHtml(issue.category ?? "—")}</td>
          <td>${this.escapeHtml(
            issue.occurred_at ? this.formatDateTime(issue.occurred_at) : "—"
          )}</td>
          <td>${this.escapeHtml(issue.error_message ?? "—")}</td>
        </tr>`;
      })
      .join("\n");

    return `<table>
      <thead>
        <tr>
          <th>Severidade</th>
          <th>Caso</th>
          <th>Suite</th>
          <th>Step</th>
          <th>#</th>
          <th>Categoria</th>
          <th>Data</th>
          <th>Mensagem</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

  private renderPerformanceSection(performance?: QaPerformance): string {
    if (!performance) {
      return "";
    }

    const slowest = Array.isArray(performance.slowest_endpoints)
      ? performance.slowest_endpoints
      : [];

    const slowestList =
      slowest.length > 0
        ? `<p><strong>Endpoints mais lentos:</strong></p>
        <ul>
          ${slowest
            .map(
              (item) =>
                `<li>${this.escapeHtml(item.url ?? "—")} — ${this.formatDuration(
                  item.average_time_ms
                )} (chamadas: ${this.formatNumber(item.call_count ?? 0)})</li>`
            )
            .join("\n")}
        </ul>`
        : "";

    return `<p>
      <strong>Métricas de performance:</strong><br/>
      Requisições totais: ${this.formatNumber(performance.total_requests ?? 0)} ·
      Tempo médio: ${this.formatDuration(
        performance.average_response_time_ms
      )} ·
      Tempo mín.: ${this.formatDuration(performance.min_response_time_ms)} ·
      Tempo máx.: ${this.formatDuration(performance.max_response_time_ms)} ·
      RPS: ${this.formatNumber(
        performance.requests_per_second ?? 0,
        1
      )} ·
      Avaliação: ${this.escapeHtml(performance.performance_rating ?? "—")}
    </p>
    ${slowestList}`;
  }

  private renderPrioritySummary(
    byPriority?: QaMetrics["by_priority"]
  ): string {
    if (!byPriority || Object.keys(byPriority).length === 0) {
      return "";
    }

    const rows = Object.entries(byPriority)
      .map(([priority, stats]) => {
        return `<tr>
          <td>${this.escapeHtml(this.capitalize(priority) ?? priority)}</td>
          <td>${this.formatNumber(stats.total ?? 0)}</td>
          <td>${this.formatNumber(stats.passed ?? 0)}</td>
          <td>${this.formatNumber(stats.failed ?? 0)}</td>
          <td>${this.escapeHtml(stats.success_rate ?? "—")}</td>
        </tr>`;
      })
      .join("\n");

    return `<h3>Resumo por Prioridade</h3>
    <table>
      <thead>
        <tr>
          <th>Prioridade</th>
          <th>Total</th>
          <th>Aprovados</th>
          <th>Reprovados</th>
          <th>Sucesso</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

  private renderCoveredFunctionalities(testCases: QaTestCase[]): string {
    if (testCases.length === 0) {
      return `<li class="muted">Nenhum caso de teste executado.</li>`;
    }

    return testCases
      .map((testCase) => {
        const label =
          testCase.description ??
          testCase.suite_name ??
          testCase.test_case_id ??
          "Funcionalidade";
        return `<li>${this.escapeHtml(label)}</li>`;
      })
      .join("\n");
  }

  private translateObjectiveText(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const normalized = trimmed.toLowerCase();
    const defaultEnglish =
      "qa/tester-friendly report format designed for documentation and html/pdf generation";

    if (normalized === defaultEnglish) {
      return "Relatório orientado para equipes de QA/testers, adequado para documentação e geração em HTML/PDF.";
    }

    return trimmed;
  }

  private truncateText(value: string, maxLength: number = 140): string {
    if (!value) {
      return "";
    }

    const normalized = String(value);
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, Math.max(0, maxLength - 1)) + "…";
  }

  private async resolveDerivedContext(
    workspacePath: string,
    data: QaReportData
  ): Promise<DerivedReportContext> {
    const resolvedWorkspace = workspacePath || process.cwd();
    const [responsible, buildVersion, environment] = await Promise.all([
      this.resolveResponsibleName(resolvedWorkspace),
      this.resolveBuildVersion(resolvedWorkspace),
      this.resolveEnvironment(resolvedWorkspace),
    ]);

    const objective =
      this.translateObjectiveText(data.report_metadata?.description) ??
      this.translateObjectiveText(data.executive_summary?.objective ?? undefined);

    return {
      responsible: responsible ?? undefined,
      buildVersion: buildVersion ?? undefined,
      environment: environment ?? undefined,
      objective: objective ?? undefined,
    };
  }

  private async resolveResponsibleName(
    workspacePath: string
  ): Promise<string | null> {
    const gitUser = await this.runGitCommand(
      ["config", "user.name"],
      workspacePath
    );
    if (gitUser) {
      return gitUser;
    }

    try {
      const user = os.userInfo();
      return user?.username ?? null;
    } catch {
      return null;
    }
  }

  private async resolveBuildVersion(
    workspacePath: string
  ): Promise<string | null> {
    const envCandidates = [
      process.env.BUILD_VERSION,
      process.env.GIT_COMMIT,
      process.env.GITHUB_SHA,
    ].filter(Boolean);

    if (envCandidates.length > 0) {
      return envCandidates[0] ?? null;
    }

    const gitTag = await this.runGitCommand(
      ["describe", "--tags", "--always"],
      workspacePath
    );
    if (gitTag) {
      return gitTag;
    }

    const gitCommit = await this.runGitCommand(
      ["rev-parse", "--short", "HEAD"],
      workspacePath
    );
    return gitCommit;
  }

  private async resolveEnvironment(
    workspacePath: string
  ): Promise<string | null> {
    const envCandidates = [
      process.env.ENVIRONMENT,
      process.env.NODE_ENV,
      process.env.APP_ENV,
      process.env.DEPLOYMENT_ENV,
    ].filter((value): value is string => Boolean(value && value.trim()));

    if (envCandidates.length > 0) {
      return envCandidates[0];
    }

    const envFromFile = await this.readEnvVariable(workspacePath, [
      "ENVIRONMENT",
      "NODE_ENV",
      "APP_ENV",
      "DEPLOYMENT_ENV",
    ]);

    return envFromFile;
  }

  private async readEnvVariable(
    workspacePath: string,
    keys: string[]
  ): Promise<string | null> {
    const uniqueKeys = Array.from(new Set(keys));
    const envFiles = [
      ".env",
      ".env.local",
      ".env.qa",
      ".env.staging",
      ".env.production",
    ];

    for (const fileName of envFiles) {
      const fullPath = path.join(workspacePath, fileName);
      const stat = await this.tryStat(fullPath);
      if (!stat || !stat.isFile()) {
        continue;
      }

      let content: string;
      try {
        content = await fs.promises.readFile(fullPath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const delimiterIndex = trimmed.indexOf("=");
        if (delimiterIndex <= 0) {
          continue;
        }

        const key = trimmed.slice(0, delimiterIndex).trim();
        if (!uniqueKeys.includes(key)) {
          continue;
        }

        let value = trimmed.slice(delimiterIndex + 1).trim();
        value = value.replace(/^['"]|['"]$/g, "");
        if (value.length > 0) {
          return value;
        }
      }
    }

    return null;
  }

  private async runGitCommand(
    args: string[],
    cwd: string
  ): Promise<string | null> {
    return await new Promise((resolve) => {
      execFile("git", args, { cwd }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const output = stdout.trim();
        resolve(output.length > 0 ? output : null);
      });
    });
  }

  private formatCurlCommand(request: QaRequest): string {
    if (request.curl_command && request.curl_command.trim().length > 0) {
      return request.curl_command.trim();
    }

    const method = (request.method ?? "GET").toUpperCase();
    const url = request.full_url ?? request.url ?? "";
    const lines: string[] = [`curl -X ${method} \\`];

    const headers = request.headers ?? {};
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`  -H '${key}: ${value}' \\`);
    }

    if (request.body !== undefined && request.body !== null) {
      const payload =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);
      lines.push(`  -d '${payload}' \\`);
    }

    lines.push(`  ${url}`);
    return lines.join("\n");
  }

  private formatCurlResponse(
    response: QaResponse,
    maxLines?: number
  ): string {
    const statusLine = `HTTP/1.1 ${response.status_code ?? ""} ${
      response.status_text ?? ""
    }`.trim();
    const lines: string[] = [statusLine];

    const headers = response.headers ?? {};
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`${key.toLowerCase()}: ${value}`);
    }

    lines.push("");

    if (response.body !== undefined) {
      const bodyString =
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body, null, 2);
      lines.push(bodyString);
    }

    if (typeof response.response_time_ms === "number") {
      lines.push("");
      lines.push(`// response_time_ms: ${response.response_time_ms}ms`);
    }

    if (response.size) {
      lines.push(`// size: ${response.size}`);
    }

    const output = lines.join("\n");

    if (typeof maxLines === "number" && maxLines > 0) {
      const max = Math.max(1, Math.floor(maxLines));
      const allLines = output.split(/\r?\n/);
      if (allLines.length > max) {
        const truncatedLines = allLines.slice(0, max);
        truncatedLines.push("...");
        truncatedLines.push(`// conteúdo truncado para ${max} linhas no PDF`);
        truncatedLines.push(
          `// linhas originais: ${allLines.length}`
        );
        return truncatedLines.join("\n");
      }
    }

    return output;
  }

  private formatDate(value?: string): string {
    if (!value) {
      return "Não informado";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  private formatDateTime(value?: string): string {
    if (!value) {
      return "Data não informada";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }

  private formatDuration(value?: number | string | null): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 1000) {
        return `${(value / 1000).toFixed(2)}s`;
      }
      return `${value.toFixed(0)}ms`;
    }

    return "—";
  }

  private formatNumber(value: number | string, fractionDigits = 0): string {
    const numeric =
      typeof value === "string" ? Number.parseFloat(value) : Number(value);
    if (!Number.isFinite(numeric)) {
      return "—";
    }
    return numeric.toLocaleString("pt-BR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  private resolveStatusClass(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized.includes("pass")) {
      return "badge-success";
    }
    if (normalized.includes("fail") || normalized.includes("erro")) {
      return "badge-danger";
    }
    return "badge-warning";
  }

  private capitalize(value?: string): string | undefined {
    if (!value) {
      return value;
    }
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private formatAssertionValue(value: unknown): string {
    if (value === null) {
      return "null";
    }
    if (value === undefined) {
      return "—";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private escapeHtml(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private toDisplayPath(sourcePath: string, workspacePath?: string): string {
    if (!workspacePath) {
      return sourcePath;
    }

    const relative = path.relative(workspacePath, sourcePath);
    if (!relative || relative.startsWith("..")) {
      return sourcePath;
    }
    return relative;
  }

  private async resolveBrowserExecutable(
    config: FlowTestConfig
  ): Promise<string | null> {
    const candidates = new Set<string>();

    const configValue = config.reporting?.pdf?.executablePath;
    if (configValue) {
      candidates.add(configValue);
    }

    const settingsValue = vscode.workspace
      .getConfiguration("flowTestRunner")
      .get<string>("pdfBrowserExecutable");
    if (settingsValue) {
      candidates.add(settingsValue);
    }

    const envCandidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_PATH,
      process.env.CHROMIUM_PATH,
      process.env.BROWSER_PATH,
    ];
    for (const candidate of envCandidates) {
      if (candidate) {
        candidates.add(candidate);
      }
    }

    for (const defaultPath of this.getDefaultBrowserPaths()) {
      candidates.add(defaultPath);
    }

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const expanded = this.expandHome(candidate.trim());
      if (!expanded) {
        continue;
      }
      const stats = await this.tryStat(expanded);
      if (stats && stats.isFile()) {
        return expanded;
      }
    }

    return null;
  }

  private getDefaultBrowserPaths(): string[] {
    const paths: string[] = [];
    const platform = process.platform;

    if (platform === "darwin") {
      paths.push(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      );
    } else if (platform === "win32") {
      const programFiles = process.env.PROGRAMFILES ?? "";
      const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "";
      const localAppData = process.env.LOCALAPPDATA ?? "";
      const candidates = [
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(
          programFilesX86,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe"
        ),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(
          programFilesX86,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe"
        ),
        path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
      ];
      paths.push(...candidates);
    } else {
      paths.push(
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable"
      );
    }

    return paths;
  }

  private expandHome(filePath: string): string {
    if (!filePath.startsWith("~")) {
      return filePath;
    }

    const home =
      process.env.HOME ??
      process.env.USERPROFILE ??
      process.env.HOMEPATH ??
      "";
    if (!home) {
      return filePath;
    }

    return path.join(home, filePath.slice(1));
  }

  private async tryStat(target: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(target);
    } catch {
      return null;
    }
  }
}
