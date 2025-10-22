import * as vscode from "vscode";
import * as path from "path";
import {
  Document,
  isMap,
  isScalar,
  isSeq,
  Node,
  Pair,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import {
  FlowTestIndex,
  FlowTestSuiteMetadata,
} from "./flowTestIndex";

export interface FlowTestQuickFix {
  title: string;
  edit: vscode.TextEdit;
  isPreferred?: boolean;
}

interface YamlLocation {
  path: Array<string | number>;
  isKey: boolean;
  currentKey?: string;
  parentType?: "map" | "seq";
}

interface CompletionContext extends YamlLocation {
  normalizedPath: string;
  metadata?: FlowTestSuiteMetadata;
}

type DocumentationEntry = {
  title: string;
  description: string;
  url?: string;
};

const ROOT_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "suite_name",
    description:
      "Nome amigável do fluxo. Aparece em relatórios e na árvore do Flow Test Runner.",
  },
  {
    title: "node_id",
    description:
      "Identificador único (kebab-case). É usado como referência entre suites e relatórios.",
  },
  {
    title: "base_url",
    description:
      "URL base utilizada como prefixo para requisições HTTP das etapas.",
  },
  {
    title: "variables",
    description:
      "Mapa de variáveis globais disponíveis para todos os passos e cenários.",
  },
  {
    title: "depends",
    description:
      "Lista de node_id de suites que precisam ser executadas antes deste fluxo.",
  },
  {
    title: "exports",
    description:
      "Variáveis exportadas por este fluxo para serem utilizadas em outros testes.",
  },
  {
    title: "scenarios",
    description:
      "Cenários que agrupam conjuntos alternativos de steps. Permite reutilização e variação de entradas.",
  },
  {
    title: "steps",
    description:
      "Sequência de passos executados pelo Flow Test Engine. Pode conter requisições, asserts, chamadas de outros testes e inputs.",
  },
];

const STEP_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "name",
    description: "Título do passo. Utilizado nos relatórios e nas execuções.",
  },
  {
    title: "step_id",
    description:
      "Identificador estável do passo. Útil para granularidade em retestes ou referências.",
  },
  {
    title: "request",
    description:
      "Configuração de uma requisição HTTP (método, URL, headers, corpo).",
  },
  {
    title: "assert",
    description:
      "Regras de validação sobre a resposta do passo (status_code, corpo, headers).",
  },
  {
    title: "call",
    description:
      "Chamada para outro Flow Test ou Step, permitindo composição de fluxos.",
  },
  {
    title: "input",
    description:
      "Solicitação de input dinâmico ao usuário ou uso de valores cacheados.",
  },
  {
    title: "scenario",
    description:
      "Nome de um cenário definido no fluxo. Permite trocar blocos de steps conforme o contexto.",
  },
  {
    title: "depends",
    description:
      "Dependências específicas daquele passo, referenciando node_id de outras suites.",
  },
  {
    title: "captures",
    description:
      "Configuração para capturar valores da resposta e armazená-los como variáveis.",
  },
  {
    title: "metadata",
    description:
      "Metadados adicionais do passo (tags, autores, observações).",
  },
];

const CALL_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "test",
    description:
      "Identificador do fluxo a ser chamado (suite_name, node_id ou caminho relativo).",
  },
  {
    title: "step",
    description:
      "Opcional. Permite executar somente um passo específico do fluxo chamado.",
  },
  {
    title: "isolate_context",
    description:
      "Quando true, executa o fluxo chamado em contexto isolado, sem compartilhar variáveis.",
  },
  {
    title: "on_error",
    description:
      "Define comportamento em falhas (ex.: continue, stop, retry).",
  },
];

const ASSERT_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "status_code",
    description: "Valida o status HTTP da resposta.",
  },
  {
    title: "body",
    description: "Valida campos do corpo da resposta via matching de objetos.",
  },
  {
    title: "headers",
    description: "Valida cabeçalhos específicos da resposta.",
  },
];

export class FlowTestLanguageService {
  constructor(private readonly index: FlowTestIndex) {}

  async provideCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const context = this.computeCompletionContext(document, position);
    if (!context) {
      return this.rootKeyCompletions();
    }

    const items: vscode.CompletionItem[] = [];
    if (context.isKey) {
      return this.getKeyCompletions(context);
    }

    const { normalizedPath } = context;
    if (normalizedPath === "steps.*.call.test" || normalizedPath === "call.test") {
      const identifiers = this.index.getAllSuiteIdentifiers();
      const unique = new Set<string>();
      const suggestions: vscode.CompletionItem[] = [];
      for (const identifier of identifiers) {
        const normalized = identifier.trim();
        if (!normalized || unique.has(normalized.toLowerCase())) {
          continue;
        }
        unique.add(normalized.toLowerCase());
        const targetMeta = this.index.getSuiteByIdentifier(identifier);
        const item = new vscode.CompletionItem(
          normalized,
          vscode.CompletionItemKind.Reference
        );
        if (targetMeta) {
          item.detail = `Suite: ${targetMeta.suite.suite_name}`;
          const relPath = targetMeta.workspacePath
            ? path
                .relative(targetMeta.workspacePath, targetMeta.suite.filePath)
                .replace(/\\/g, "/")
            : targetMeta.suite.filePath;
          const doc = new vscode.MarkdownString();
          doc.appendMarkdown(`**${targetMeta.suite.suite_name}**\n\n`);
          if (targetMeta.suite.node_id) {
            doc.appendMarkdown(`• Node ID: \`${targetMeta.suite.node_id}\`\n`);
          }
          doc.appendMarkdown(`• Arquivo: \`${relPath}\``);
          item.documentation = doc;
        } else {
          item.detail = "Flow Test suite";
        }
        suggestions.push(item);
      }
      return suggestions;
    }

    if (
      normalizedPath === "depends.*" ||
      normalizedPath === "steps.*.depends.*"
    ) {
      this.index.getAllNodeIds().forEach((nodeId) => {
        const item = new vscode.CompletionItem(
          nodeId,
          vscode.CompletionItemKind.Value
        );
        item.detail = "Node ID de Flow Test";
        items.push(item);
      });
      return items;
    }

    if (
      normalizedPath === "steps.*.scenario" ||
      normalizedPath === "scenario"
    ) {
      const metadata = context.metadata;
      const scenarioNames = metadata?.scenarioNames.length
        ? metadata?.scenarioNames
        : this.index.getAllScenarioNames();
      scenarioNames.forEach((name) => {
        const item = new vscode.CompletionItem(
          name,
          vscode.CompletionItemKind.EnumMember
        );
        item.detail = "Cenário disponível";
        items.push(item);
      });
      return items;
    }

    if (
      normalizedPath === "exports.*" ||
      normalizedPath === "steps.*.captures.*.as"
    ) {
      const metadata = context.metadata;
      const exportCandidates = new Set<string>();
      metadata?.capturedVariables.forEach((name) => exportCandidates.add(name));
      metadata?.exportedVariables.forEach((name) => exportCandidates.add(name));
      if (exportCandidates.size === 0 && metadata) {
        metadata.stepNames.forEach((name) => exportCandidates.add(`${name}_result`));
      }
      exportCandidates.forEach((name) => {
        const item = new vscode.CompletionItem(
          name,
          vscode.CompletionItemKind.Variable
        );
        item.detail = "Variável capturada/exportada";
        items.push(item);
      });
      return items;
    }

    if (normalizedPath.startsWith("variables.")) {
      const metadata = context.metadata;
      const globalVariables = new Set<string>();
      metadata?.variableNames.forEach((name) => globalVariables.add(name));
      metadata?.exportedVariables.forEach((name) => globalVariables.add(name));
      this.index.getAllVariableNames().forEach((name) =>
        globalVariables.add(name)
      );
      globalVariables.forEach((name) => {
        const item = new vscode.CompletionItem(
          name,
          vscode.CompletionItemKind.Variable
        );
        item.detail = "Variável conhecida";
        items.push(item);
      });
      return items;
    }

    if (normalizedPath === "steps.*.call.step") {
      const metadata = context.metadata;
      if (metadata) {
        metadata.stepNames.forEach((name) => {
          const item = new vscode.CompletionItem(
            name,
            vscode.CompletionItemKind.Method
          );
          item.detail = "Passo deste Flow Test";
          items.push(item);
        });
      }
      return items;
    }

    return items;
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const context = this.computeCompletionContext(document, position);
    if (!context) {
      return undefined;
    }

    // Hover on keys
    if (context.isKey && context.currentKey) {
      const docEntry = this.getDocumentationForKey(context);
      if (docEntry) {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${docEntry.title}**\n\n`);
        markdown.appendMarkdown(docEntry.description);
        if (docEntry.url) {
          markdown.appendMarkdown(`\n\n[Ver documentação](${docEntry.url})`);
          markdown.isTrusted = true;
        }
        const range = document.getWordRangeAtPosition(position, /[\w._-]+/);
        return new vscode.Hover(markdown, range);
      }
    }

    // Hover on call.test values
    if (!context.isKey && context.normalizedPath.endsWith("call.test")) {
      const identifier = this.extractScalarAtPosition(document, position);
      if (identifier) {
        const metadata = this.index.getSuiteByIdentifier(identifier);
        if (metadata) {
          const markdown = new vscode.MarkdownString();
          markdown.appendMarkdown(`**${metadata.suite.suite_name}**\n\n`);
          if (metadata.suite.node_id) {
            markdown.appendMarkdown(`• Node ID: \`${metadata.suite.node_id}\`\n`);
          }
          const relPath = metadata.workspacePath
            ? path
                .relative(
                  metadata.workspacePath,
                  metadata.suite.filePath
                )
                .replace(/\\/g, "/")
            : metadata.suite.filePath;
          markdown.appendMarkdown(`• Arquivo: \`${relPath}\`\n`);
          if (metadata.stepNames.length > 0) {
            markdown.appendMarkdown(
              `• Passos: ${metadata.stepNames.slice(0, 5).join(", ")}`
            );
          }
          const range = document.getWordRangeAtPosition(position, /[\w./-]+/);
          return new vscode.Hover(markdown, range);
        }
      }
    }

    // Hover on scenario values
    if (!context.isKey && context.normalizedPath.endsWith("scenario")) {
      const value = this.extractScalarAtPosition(document, position);
      if (value && context.metadata) {
        const contains = context.metadata.scenarioNames.includes(value);
        if (contains) {
          const markdown = new vscode.MarkdownString();
          markdown.appendMarkdown(`Cenário definido neste Flow Test: **${value}**`);
          const range = document.getWordRangeAtPosition(position, /[\w./-]+/);
          return new vscode.Hover(markdown, range);
        }
      }
    }

    return undefined;
  }

  getQuickFixes(document: vscode.TextDocument): FlowTestQuickFix[] {
    const fixes: FlowTestQuickFix[] = [];
    let parsed: any;
    try {
      parsed = parseDocument(document.getText()).toJS();
    } catch {
      return fixes;
    }

    if (!parsed || typeof parsed !== "object") {
      return fixes;
    }

    const fileBase = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));

    if (!this.hasMeaningfulString(parsed.node_id)) {
      const suggestion = this.toKebabCase(
        this.hasMeaningfulString(parsed.suite_name)
          ? parsed.suite_name
          : fileBase
      );
      const insertPosition = this.findInsertPosition(
        document,
        ["suite_name", "node_id"]
      );
      if (insertPosition) {
        fixes.push({
          title: `Adicionar node_id (${suggestion})`,
          edit: vscode.TextEdit.insert(
            insertPosition,
            `node_id: ${suggestion}\n`
          ),
          isPreferred: true,
        });
      }
    }

    if (!this.hasMeaningfulString(parsed.suite_name)) {
      const suggestion = this.toTitleCase(fileBase);
      const insertPosition = this.findInsertPosition(document, ["suite_name"]);
      if (insertPosition) {
        fixes.push({
          title: `Adicionar suite_name (${suggestion})`,
          edit: vscode.TextEdit.insert(
            insertPosition,
            `suite_name: ${suggestion}\n`
          ),
        });
      }
    }

    return fixes;
  }

  private computeCompletionContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): CompletionContext | undefined {
    const text = document.getText();
    const offset = document.offsetAt(position);

    let doc: Document.Parsed;
    try {
      doc = parseDocument(text, { uniqueKeys: false });
    } catch {
      return undefined;
    }

    if (!doc || !doc.contents) {
      return undefined;
    }

    const location = this.findLocation(doc.contents, offset, []);
    if (!location) {
      return undefined;
    }

    const normalizedPath = this.normalizePath(location.path);
    const metadata = this.index.getMetadataForDocument(document);

    return {
      ...location,
      normalizedPath,
      metadata,
    };
  }

  private findLocation(
    node: Node | null | undefined,
    offset: number,
    currentPath: Array<string | number>
  ): YamlLocation | undefined {
    if (!node) {
      return undefined;
    }

    const nodeRange = this.getNodeRange(node);
    if (!nodeRange || offset < nodeRange[0] || offset > nodeRange[1]) {
      return undefined;
    }

    if (isScalar(node)) {
      return {
        path: currentPath,
        isKey: false,
      };
    }

    if (isSeq(node)) {
      return this.findInSequence(node, offset, currentPath);
    }

    if (isMap(node)) {
      return this.findInMap(node, offset, currentPath);
    }

    return {
      path: currentPath,
      isKey: false,
    };
  }

  private findInMap(
    map: YAMLMap,
    offset: number,
    currentPath: Array<string | number>
  ): YamlLocation | undefined {
    for (const pair of map.items as Pair[]) {
      const keyNode = pair.key as Node | null;
      const keyText = this.nodeToString(keyNode);
      const keyRange = this.getNodeRange(keyNode);
      if (keyRange && offset >= keyRange[0] && offset <= keyRange[1]) {
        return {
          path: currentPath,
          isKey: true,
          currentKey: keyText || undefined,
          parentType: "map",
        };
      }

      const valueNode = pair.value as Node | null;
      const childPath = keyText
        ? [...currentPath, keyText]
        : [...currentPath];

      const valueLocation = this.findLocation(valueNode, offset, childPath);
      if (valueLocation) {
        return valueLocation;
      }

      if (
        keyRange &&
        (!valueNode || !this.getNodeRange(valueNode)) &&
        offset >= keyRange[1]
      ) {
        return {
          path: childPath,
          isKey: false,
        };
      }
    }

    return {
      path: currentPath,
      isKey: false,
    };
  }

  private findInSequence(
    seq: YAMLSeq,
    offset: number,
    currentPath: Array<string | number>
  ): YamlLocation | undefined {
    const items = seq.items as (Node | null)[];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const itemLocation = this.findLocation(
        item,
        offset,
        [...currentPath, index]
      );
      if (itemLocation) {
        return itemLocation;
      }
    }

    return {
      path: currentPath,
      isKey: false,
      parentType: "seq",
    };
  }

  private getKeyCompletions(context: CompletionContext): vscode.CompletionItem[] {
    const normalizedParent = this.normalizePath(context.path);

    if (!normalizedParent) {
      return this.rootKeyCompletions();
    }

    if (normalizedParent === "steps" || normalizedParent === "steps.*") {
      return this.createCompletionsFromDocs(
        STEP_KEY_SUGGESTIONS,
        vscode.CompletionItemKind.Field
      );
    }

    if (
      normalizedParent === "steps.*.call" ||
      normalizedParent === "call"
    ) {
      return this.createCompletionsFromDocs(
        CALL_KEY_SUGGESTIONS,
        vscode.CompletionItemKind.Field
      );
    }

    if (
      normalizedParent === "steps.*.assert" ||
      normalizedParent === "assert"
    ) {
      return this.createCompletionsFromDocs(
        ASSERT_KEY_SUGGESTIONS,
        vscode.CompletionItemKind.Field
      );
    }

    return [];
  }

  private rootKeyCompletions(): vscode.CompletionItem[] {
    return this.createCompletionsFromDocs(
      ROOT_KEY_SUGGESTIONS,
      vscode.CompletionItemKind.Field
    );
  }

  private createCompletionsFromDocs(
    docs: DocumentationEntry[],
    kind: vscode.CompletionItemKind
  ): vscode.CompletionItem[] {
    return docs.map((entry) => {
      const item = new vscode.CompletionItem(entry.title, kind);
      item.detail = entry.description;
      if (entry.url) {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${entry.title}**\n\n${entry.description}`);
        markdown.appendMarkdown(`\n\n[Documentação](${entry.url})`);
        markdown.isTrusted = true;
        item.documentation = markdown;
      }
      return item;
    });
  }

  private getDocumentationForKey(
    context: CompletionContext
  ): DocumentationEntry | undefined {
    if (!context.currentKey) {
      return undefined;
    }
    const key = context.currentKey;
    const normalizedParent = this.normalizePath(context.path);

    const lookup = (
      source: DocumentationEntry[],
      title: string
    ): DocumentationEntry | undefined =>
      source.find((entry) => entry.title === title);

    if (!normalizedParent) {
      return lookup(ROOT_KEY_SUGGESTIONS, key);
    }
    if (normalizedParent === "steps" || normalizedParent === "steps.*") {
      return lookup(STEP_KEY_SUGGESTIONS, key);
    }
    if (
      normalizedParent === "steps.*.call" ||
      normalizedParent === "call"
    ) {
      return lookup(CALL_KEY_SUGGESTIONS, key);
    }
    if (
      normalizedParent === "steps.*.assert" ||
      normalizedParent === "assert"
    ) {
      return lookup(ASSERT_KEY_SUGGESTIONS, key);
    }
    return undefined;
  }

  private getNodeRange(node: Node | null | undefined): [number, number] | null {
    if (!node) {
      return null;
    }
    const range = (node as any).range;
    if (Array.isArray(range) && range.length >= 2) {
      return [range[0], range[1]];
    }
    const valueRange = (node as any).valueRange;
    if (Array.isArray(valueRange) && valueRange.length >= 2) {
      return [valueRange[0], valueRange[1]];
    }
    return null;
  }

  private nodeToString(node: Node | null | undefined): string | null {
    if (!node) {
      return null;
    }
    if (isScalar(node)) {
      const scalar = node as Scalar;
      if (typeof scalar.value === "string") {
        return scalar.value;
      }
      if (scalar.value != null) {
        return String(scalar.value);
      }
    }
    return null;
  }

  private normalizePath(path: Array<string | number>): string {
    return path
      .map((segment) =>
        typeof segment === "number" ? "*" : segment
      )
      .filter((segment) => segment !== undefined && segment !== null && segment !== "")
      .join(".");
  }

  private extractScalarAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | null {
    const range = document.getWordRangeAtPosition(position, /[\w./-]+/);
    if (!range) {
      return null;
    }
    return document.getText(range);
  }

  private hasMeaningfulString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private toKebabCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private toTitleCase(value: string): string {
    const cleaned = value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private findInsertPosition(
    document: vscode.TextDocument,
    preferredKeys: string[]
  ): vscode.Position | null {
    const totalLines = document.lineCount;
    let lastPreferredLine: number | null = null;

    for (let line = 0; line < totalLines; line++) {
      const text = document.lineAt(line).text.trim();
      if (text.length === 0 || text.startsWith("#")) {
        continue;
      }

      for (const key of preferredKeys) {
        if (text.startsWith(`${key}:`)) {
          lastPreferredLine = line;
        }
      }
    }

    if (lastPreferredLine != null) {
      return new vscode.Position(lastPreferredLine + 1, 0);
    }

    for (let line = 0; line < totalLines; line++) {
      const text = document.lineAt(line).text.trim();
      if (text.length > 0 && !text.startsWith("#")) {
        return new vscode.Position(line, 0);
      }
    }

    return new vscode.Position(totalLines, 0);
  }
}
