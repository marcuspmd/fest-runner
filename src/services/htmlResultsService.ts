import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';
import { FlowTestConfig } from '../models/types';

type ResolvedReportDirectories = {
  workingDir: string;
  outputDir: string;
  htmlDir: string;
  searchDirs: string[];
  config: FlowTestConfig | null;
};

export class HtmlResultsService {
  private static instance: HtmlResultsService;
  private webviewPanel: vscode.WebviewPanel | undefined;
  private configService = ConfigService.getInstance();
  private testRunner: any; // Será injetado do extension.ts
  private navigationHistory: string[] = [];
  private navigationIndex: number = -1;
  private currentResourceRoots: Set<string> = new Set();
  private isNavigating: boolean = false;

  private constructor() {}

  static getInstance(): HtmlResultsService {
    if (!HtmlResultsService.instance) {
      HtmlResultsService.instance = new HtmlResultsService();
    }
    return HtmlResultsService.instance;
  }

  setTestRunner(testRunner: any): void {
    this.testRunner = testRunner;
  }

  async showResults(workspacePath: string, suiteName?: string): Promise<void> {
    try {
      const htmlResultsPath = await this.findHtmlResults(workspacePath, suiteName);
      if (!htmlResultsPath) {
        vscode.window.showWarningMessage('No HTML test results found. Make sure to run tests with HTML output enabled.');
        return;
      }

      await this.displayHtmlResults(htmlResultsPath, suiteName || 'Test Results');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to show test results: ${errorMessage}`);
    }
  }

  private async findHtmlResults(workspacePath: string, suiteName?: string): Promise<string | null> {
    const directories = await this.resolveReportDirectories(workspacePath);
    const targets = suiteName ? this.buildSuiteLookupKeys(suiteName) : new Set<string>();

    if (suiteName) {
      const suiteReport = await this.findSuiteReportFromLatest(
        directories.outputDir,
        suiteName,
        targets
      );
      if (suiteReport) {
        return suiteReport;
      }
    } else {
      const aggregateReport = await this.findAggregateReportFromLatest(
        directories.outputDir
      );
      if (aggregateReport) {
        return aggregateReport;
      }
    }

    if (suiteName && targets.size > 0) {
      for (const dir of directories.searchDirs) {
        const suiteReport = await this.findSuiteReportInDirectory(dir, targets, suiteName);
        if (suiteReport) {
          return suiteReport;
        }
      }
    }

    for (const dir of directories.searchDirs) {
      const aggregateReport = await this.findAggregateReportInDirectory(dir);
      if (aggregateReport) {
        return aggregateReport;
      }
    }

    return this.searchWorkspaceFallback(workspacePath, suiteName, directories, targets);
  }

  private async resolveReportDirectories(workspacePath: string): Promise<ResolvedReportDirectories> {
    let config: FlowTestConfig | null = null;
    try {
      config = await this.configService.getConfig(workspacePath);
    } catch (error) {
      console.warn('Failed to load Flow Test configuration for results lookup:', error);
    }

    const workingDir = config?.workingDirectory ?? workspacePath;
    const reporting = config?.reporting;

    const outputDirRaw = reporting?.outputDir ?? 'results';
    const outputDir = path.normalize(
      path.isAbsolute(outputDirRaw)
        ? outputDirRaw
        : path.resolve(workingDir, outputDirRaw)
    );

    const htmlSubdirRaw = reporting?.html?.outputSubdir ?? 'html';
    const htmlDir = htmlSubdirRaw
      ? path.normalize(
          path.isAbsolute(htmlSubdirRaw)
            ? htmlSubdirRaw
            : path.resolve(outputDir, htmlSubdirRaw)
        )
      : outputDir;

    const preferredDirs = [
      htmlDir,
      outputDir,
      path.join(workspacePath, 'results', 'html'),
      path.join(workspacePath, 'results'),
      path.join(workspacePath, '.fest-runner'),
      workspacePath
    ];

    const searchDirs = Array.from(
      new Set(preferredDirs.map(dir => path.normalize(dir)))
    );

    return {
      workingDir,
      outputDir,
      htmlDir,
      searchDirs,
      config
    };
  }

  private buildSuiteLookupKeys(rawName: string): Set<string> {
    const keys = new Set<string>();
    if (!rawName) {
      return keys;
    }

    const variants = new Set<string>();
    const trimmed = rawName.trim();
    if (trimmed) {
      variants.add(trimmed);
      variants.add(trimmed.toLowerCase());
      variants.add(path.basename(trimmed));
    }

    const splitTokens = trimmed
      .split(/[:/\\]/)
      .map(part => part.trim())
      .filter(Boolean);
    splitTokens.forEach(token => variants.add(token));
    variants.add(trimmed.replace(/_/g, ' '));

    variants.forEach(value => {
      const sanitized = this.sanitizeFileName(value);
      if (sanitized) {
        keys.add(sanitized);
      }
    });

    return keys;
  }

  private sanitizeFileName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async findSuiteReportFromLatest(
    outputDir: string,
    suiteName: string,
    targets: Set<string>
  ): Promise<string | null> {
    const latestPath = path.join(outputDir, 'latest.json');
    if (!(await this.fileExists(latestPath))) {
      return null;
    }

    try {
      const rawContent = await fs.promises.readFile(latestPath, 'utf8');
      const parsed = JSON.parse(rawContent);
      const assets: any[] = Array.isArray(parsed?.report_metadata?.assets)
        ? parsed.report_metadata.assets
        : [];

      const rawComparisons = new Set<string>();
      rawComparisons.add(suiteName.trim().toLowerCase());

      for (const asset of assets) {
        if (!asset || asset.scope !== 'suite') {
          continue;
        }

        const candidateValues: string[] = [];
        const suiteInfo = asset.suite ?? {};

        if (asset.suite_name) {
          candidateValues.push(String(asset.suite_name));
        }
        if (asset.node_id) {
          candidateValues.push(String(asset.node_id));
        }
        if (suiteInfo.suite_name) {
          candidateValues.push(String(suiteInfo.suite_name));
        }
        if (suiteInfo.node_id) {
          candidateValues.push(String(suiteInfo.node_id));
        }

        const fileNameValue = asset.file_name ?? asset.file;
        if (fileNameValue) {
          candidateValues.push(String(fileNameValue));
        }

        const sanitizedMatch = candidateValues.some(value => {
          const sanitized = this.sanitizeFileName(String(value));
          return targets.has(sanitized);
        });

        const rawMatch = candidateValues.some(value =>
          rawComparisons.has(String(value).trim().toLowerCase())
        );

        if (!sanitizedMatch && !rawMatch) {
          continue;
        }

        const relativeFile: string | undefined = asset.file || asset.file_name || asset.relativePath;
        if (!relativeFile) {
          continue;
        }

        const resolvedPath = path.isAbsolute(relativeFile)
          ? path.normalize(relativeFile)
          : path.normalize(path.join(outputDir, relativeFile.replace(/\//g, path.sep)));

        if (await this.fileExists(resolvedPath)) {
          return resolvedPath;
        }
      }
    } catch (error) {
      console.warn('Failed to parse Flow Test latest report metadata:', error);
    }

    return null;
  }

  private async findAggregateReportFromLatest(outputDir: string): Promise<string | null> {
    const latestPath = path.join(outputDir, 'latest.json');
    if (!(await this.fileExists(latestPath))) {
      return null;
    }

    try {
      const rawContent = await fs.promises.readFile(latestPath, 'utf8');
      const parsed = JSON.parse(rawContent);
      const assets: any[] = Array.isArray(parsed?.report_metadata?.assets)
        ? parsed.report_metadata.assets
        : [];

      for (const asset of assets) {
        if (!asset || asset.scope !== 'aggregate') {
          continue;
        }

        const relativeFile: string | undefined = asset.file || asset.file_name || asset.relativePath;
        if (!relativeFile) {
          continue;
        }

        const resolvedPath = path.isAbsolute(relativeFile)
          ? path.normalize(relativeFile)
          : path.normalize(path.join(outputDir, relativeFile.replace(/\//g, path.sep)));

        if (await this.fileExists(resolvedPath)) {
          return resolvedPath;
        }
      }
    } catch (error) {
      console.warn('Failed to read Flow Test report metadata for aggregate results:', error);
    }

    return null;
  }

  private async findSuiteReportInDirectory(
    directory: string,
    targets: Set<string>,
    suiteName?: string
  ): Promise<string | null> {
    if (!(await this.directoryExists(directory))) {
      return null;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      return null;
    }

    const matches: Array<{ filePath: string; weight: number; mtime: number }> = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      if (this.isIrrelevantHtmlFile(filePath)) {
        continue;
      }

      const baseName = path.basename(entry.name, path.extname(entry.name));
      const sanitizedBase = this.sanitizeFileName(baseName);
      const sanitizedMatch = targets.has(sanitizedBase);

      let weight = sanitizedMatch ? 2 : 0;

      if (!sanitizedMatch && suiteName) {
        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          const lowerContent = content.toLowerCase();
          if (lowerContent.includes(suiteName.toLowerCase())) {
            weight = 1;
          } else if (this.isTestResultsHtml(content)) {
            weight = 0.5;
          }
        } catch {
          continue;
        }
      }

      if (weight <= 0) {
        continue;
      }

      try {
        const stats = await fs.promises.stat(filePath);
        matches.push({ filePath, weight, mtime: stats.mtimeMs });
      } catch {
        continue;
      }
    }

    if (matches.length === 0) {
      return null;
    }

    matches.sort((a, b) => {
      if (b.weight === a.weight) {
        return b.mtime - a.mtime;
      }
      return b.weight - a.weight;
    });

    return matches[0].filePath;
  }

  private async findAggregateReportInDirectory(directory: string): Promise<string | null> {
    if (!(await this.directoryExists(directory))) {
      return null;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      return null;
    }

    const matches: Array<{ filePath: string; priority: number; mtime: number }> = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      if (this.isIrrelevantHtmlFile(filePath)) {
        continue;
      }

      const normalized = entry.name.toLowerCase();
      let priority = 1;
      if (normalized.startsWith('index_')) {
        priority = 3;
      } else if (normalized.includes('summary')) {
        priority = 2;
      }

      try {
        const stats = await fs.promises.stat(filePath);
        matches.push({ filePath, priority, mtime: stats.mtimeMs });
      } catch {
        continue;
      }
    }

    if (matches.length === 0) {
      return null;
    }

    matches.sort((a, b) => {
      if (b.priority === a.priority) {
        return b.mtime - a.mtime;
      }
      return b.priority - a.priority;
    });

    return matches[0].filePath;
  }

  private async searchWorkspaceFallback(
    workspacePath: string,
    suiteName: string | undefined,
    directories: ResolvedReportDirectories,
    targets: Set<string>
  ): Promise<string | null> {
    const candidatePaths = new Set<string>();

    if (suiteName && targets.size > 0) {
      targets.forEach(target => {
        candidatePaths.add(path.join(directories.htmlDir, `${target}.html`));
        candidatePaths.add(path.join(directories.htmlDir, `${target}_latest.html`));
        candidatePaths.add(path.join(directories.htmlDir, `${target}-results.html`));
        candidatePaths.add(path.join(directories.outputDir, `${target}.html`));
        candidatePaths.add(path.join(directories.outputDir, `${target}_latest.html`));
      });
    }

    candidatePaths.add(path.join(directories.htmlDir, 'index.html'));
    candidatePaths.add(path.join(directories.outputDir, 'index.html'));
    candidatePaths.add(path.join(directories.outputDir, 'latest.html'));
    candidatePaths.add(path.join(workspacePath, 'test-results.html'));
    candidatePaths.add(path.join(workspacePath, 'flow-test-results.html'));
    candidatePaths.add(path.join(workspacePath, 'results', 'index.html'));
    candidatePaths.add(path.join(workspacePath, '.fest-runner', 'results.html'));
    candidatePaths.add(path.join(workspacePath, '.fest-runner', 'test-results.html'));

    for (const candidate of candidatePaths) {
      const normalizedCandidate = path.normalize(candidate);
      if (
        await this.fileExists(normalizedCandidate) &&
        !this.isIrrelevantHtmlFile(normalizedCandidate)
      ) {
        return normalizedCandidate;
      }
    }

    const processed = new Set<string>();

    for (const dir of directories.searchDirs) {
      if (!(await this.directoryExists(dir))) {
        continue;
      }

      const key = path.normalize(dir);
      if (processed.has(key)) {
        continue;
      }
      processed.add(key);

      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(dir, '**/*.html'),
        '**/node_modules/**'
      );

      const match = await this.pickFirstMatchingFile(files, targets, suiteName);
      if (match) {
        return match;
      }
    }

    const workspaceFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspacePath, '**/*.html'),
      '**/node_modules/**'
    );
    return this.pickFirstMatchingFile(workspaceFiles, targets, suiteName);
  }

  private async pickFirstMatchingFile(
    files: readonly vscode.Uri[],
    targets: Set<string>,
    suiteName?: string
  ): Promise<string | null> {
    for (const file of files) {
      const filePath = file.fsPath;
      if (this.isIrrelevantHtmlFile(filePath)) {
        continue;
      }

      const baseName = path.basename(filePath, path.extname(filePath));
      const sanitizedBase = this.sanitizeFileName(baseName);

      if (targets.size > 0 && targets.has(sanitizedBase)) {
        return filePath;
      }

      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        if (suiteName) {
          if (content.toLowerCase().includes(suiteName.toLowerCase())) {
            return filePath;
          }
          if (targets.size > 0) {
            continue;
          }
        }

        if (this.isTestResultsHtml(content)) {
          return filePath;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(directory: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(directory);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private isTestResultsHtml(content: string): boolean {
    const testResultsIndicators = [
      'flow-test',
      'test-results',
      'suite_name',
      'test-suite',
      'passed',
      'failed',
      'duration'
    ];

    const lowerContent = content.toLowerCase();
    return testResultsIndicators.some(indicator => lowerContent.includes(indicator));
  }

  private isIrrelevantHtmlFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    return normalized.includes('/coverage/') || normalized.includes('/lcov-report/');
  }

  private async displayHtmlResults(htmlPath: string, title: string, addToHistory: boolean = true): Promise<void> {
    // Adicionar ao histórico de navegação
    if (addToHistory) {
      // Remove items após o índice atual (quando navegamos para trás e então para novo link)
      this.navigationHistory = this.navigationHistory.slice(0, this.navigationIndex + 1);
      this.navigationHistory.push(htmlPath);
      this.navigationIndex = this.navigationHistory.length - 1;
    }

    const htmlDir = path.dirname(htmlPath);
    const needsRecreate = this.webviewPanel && !this.currentResourceRoots.has(htmlDir);

    // Recriar webview se mudou de diretório
    if (needsRecreate) {
      this.isNavigating = true;
      this.webviewPanel?.dispose();
      this.webviewPanel = undefined;
      this.currentResourceRoots.clear();
      this.isNavigating = false;
    }

    // Criar webview se não existe
    if (!this.webviewPanel) {
      this.currentResourceRoots.add(htmlDir);
      this.currentResourceRoots.add(path.join(htmlDir, '..'));

      this.webviewPanel = vscode.window.createWebviewPanel(
        'flowTestResults',
        `Flow Test Results - ${title}`,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: Array.from(this.currentResourceRoots).map(dir => vscode.Uri.file(dir))
        }
      );

      this.webviewPanel.onDidDispose(() => {
        this.webviewPanel = undefined;
        this.currentResourceRoots.clear();
        // Limpar histórico APENAS se não estiver navegando (usuário fechou)
        if (!this.isNavigating) {
          this.navigationHistory = [];
          this.navigationIndex = -1;
        }
      });

      this.setupMessageHandlers();
    } else {
      // Apenas atualizar título
      this.webviewPanel.title = `Flow Test Results - ${title}`;
    }

    try {
      let htmlContent = await fs.promises.readFile(htmlPath, 'utf8');

      htmlContent = this.processHtmlContent(htmlContent, htmlPath);

      this.webviewPanel.webview.html = htmlContent;
    } catch (error) {
      this.webviewPanel.webview.html = this.getErrorHtml(error instanceof Error ? error.message : String(error));
    }
  }

  private setupMessageHandlers(): void {
    if (!this.webviewPanel) return;

    this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'navigateToReport':
          if (message.path) {
            // Normalizar o caminho (converter / para separador do sistema)
            const normalizedPath = path.normalize(message.path);
            // Verificar se o arquivo existe
            if (await this.fileExists(normalizedPath)) {
              await this.displayHtmlResults(normalizedPath, path.basename(normalizedPath, '.html'), true);
            } else {
              vscode.window.showWarningMessage(`Report file not found: ${normalizedPath}`);
            }
          }
          break;
        case 'navigateBack':
          if (this.navigationIndex > 0) {
            this.navigationIndex--;
            const previousPath = this.navigationHistory[this.navigationIndex];
            await this.displayHtmlResults(previousPath, path.basename(previousPath, '.html'), false);
          }
          break;
        case 'navigateForward':
          if (this.navigationIndex < this.navigationHistory.length - 1) {
            this.navigationIndex++;
            const nextPath = this.navigationHistory[this.navigationIndex];
            await this.displayHtmlResults(nextPath, path.basename(nextPath, '.html'), false);
          }
          break;
        case 'rerunAndShowReport':
          if (this.testRunner) {
            const lastState = this.testRunner.getLastExecutionState();
            if (!lastState) {
              vscode.window.showWarningMessage('No previous test execution found');
              break;
            }

            await this.testRunner.retestLast();

            // Aguardar um pouco para o relatório ser gerado
            await new Promise(resolve => setTimeout(resolve, 500));

            // Recarregar o relatório atualizado
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
              await this.showResults(workspaceFolder.uri.fsPath);
            }
          } else {
            vscode.window.showWarningMessage('Test runner not available');
          }
          break;
        case 'openFile':
          if (message.path) {
            const uri = vscode.Uri.file(message.path);
            await vscode.window.showTextDocument(uri);
          }
          break;
      }
    });
  }

  private processHtmlContent(htmlContent: string, htmlPath: string): string {
    const webview = this.webviewPanel!.webview;
    const htmlDir = path.dirname(htmlPath);

    htmlContent = htmlContent.replace(
      /<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, href) => {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, href);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(href, resourceUri.toString());
      }
    );

    htmlContent = htmlContent.replace(
      /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        if (src.startsWith('http://') || src.startsWith('https://')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, src);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(src, resourceUri.toString());
      }
    );

    htmlContent = htmlContent.replace(
      /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi,
      (match, src) => {
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          return match;
        }
        const resourcePath = path.resolve(htmlDir, src);
        const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
        return match.replace(src, resourceUri.toString());
      }
    );

    // Processar links <a href> para navegação entre relatórios
    htmlContent = htmlContent.replace(
      /<a\s+([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>/gi,
      (match, attrs, href) => {
        // Pular links externos e âncoras
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
          return match;
        }
        // Processar apenas links .html
        if (href.endsWith('.html')) {
          const resourcePath = path.resolve(htmlDir, href);
          const resourceUri = webview.asWebviewUri(vscode.Uri.file(resourcePath));
          return `<a ${attrs.replace(href, resourceUri.toString())} data-report-link="${resourcePath}">`;
        }
        return match;
      }
    );

    const canGoBack = this.navigationIndex > 0;
    const canGoForward = this.navigationIndex < this.navigationHistory.length - 1;
    const currentDir = path.dirname(htmlPath).replace(/\\/g, '/');

    const navigationBar = `
      <div style="position: fixed; top: 10px; right: 10px; z-index: 1000; display: flex; gap: 4px;">
        <button onclick="navigateBack()" id="backBtn" ${!canGoBack ? 'disabled' : ''} style="
          background: ${canGoBack ? '#007acc' : '#6c757d'};
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: ${canGoBack ? 'pointer' : 'not-allowed'};
          font-size: 12px;
          opacity: ${canGoBack ? '1' : '0.5'};
        ">
          ← Voltar
        </button>
        <button onclick="navigateForward()" id="forwardBtn" ${!canGoForward ? 'disabled' : ''} style="
          background: ${canGoForward ? '#007acc' : '#6c757d'};
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: ${canGoForward ? 'pointer' : 'not-allowed'};
          font-size: 12px;
          opacity: ${canGoForward ? '1' : '0.5'};
        ">
          Avançar →
        </button>
        <button onclick="rerunWithCache()" style="
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        ">
          ⚡ Rerun with Cache
        </button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const CURRENT_DIR = ${JSON.stringify(currentDir)};

        function navigateBack() {
          vscode.postMessage({ command: 'navigateBack' });
        }

        function navigateForward() {
          vscode.postMessage({ command: 'navigateForward' });
        }

        function rerunWithCache() {
          vscode.postMessage({ command: 'rerunAndShowReport' });
        }

        // Prevenir TODOS os links de abrirem no navegador
        document.addEventListener('click', (event) => {
          const target = event.target.closest('a');
          if (!target) return;

          // Permitir links com target="_blank" (abrir externamente)
          if (target.getAttribute('target') === '_blank') {
            return true;
          }

          // Prevenir comportamento padrão para todos os outros links
          event.preventDefault();
          event.stopPropagation();

          const href = target.getAttribute('href') || target.href || '';

          // Navegação entre relatórios HTML - verificar se tem data-report-link primeiro
          if (target.hasAttribute('data-report-link')) {
            const reportPath = target.getAttribute('data-report-link');
            vscode.postMessage({
              command: 'navigateToReport',
              path: reportPath
            });
            return false;
          }

          // Links .html relativos (como "outro.html" ou "./subdir/test.html")
          if (href && (href.endsWith('.html') || href.includes('.html?') || href.includes('.html#'))) {
            let fullPath = href;

            // Se for um link relativo, resolver o caminho completo
            if (!href.startsWith('/') && !href.match(/^[a-zA-Z]:/)) {
              fullPath = CURRENT_DIR + '/' + href;
            }

            // Remover query strings e hashes
            fullPath = fullPath.split('?')[0].split('#')[0];

            vscode.postMessage({
              command: 'navigateToReport',
              path: fullPath
            });
            return false;
          }

          // Links externos (http/https)
          if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            // Bloquear - já não tem target="_blank"
            return false;
          }

          // Abrir arquivos de código no editor
          if (href && href.startsWith('file://')) {
            vscode.postMessage({
              command: 'openFile',
              path: href.replace('file://', '')
            });
            return false;
          }

          // Qualquer outro link - prevenir
          return false;
        }, true);
      </script>
    `;

    if (htmlContent.includes('</body>')) {
      htmlContent = htmlContent.replace('</body>', `${navigationBar}</body>`);
    } else {
      htmlContent += navigationBar;
    }

    return htmlContent;
  }

  private getErrorHtml(errorMessage: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Flow Test Results - Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            padding: 16px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .error-title {
            font-weight: bold;
            color: var(--vscode-errorForeground);
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        <h1>Failed to Load Test Results</h1>
        <div class="error">
          <div class="error-title">Error:</div>
          <div>${errorMessage}</div>
        </div>
        <p>Make sure test execution completed successfully and HTML output was generated.</p>
      </body>
      </html>
    `;
  }

  dispose(): void {
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
      this.webviewPanel = undefined;
    }
  }
}
