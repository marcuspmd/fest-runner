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
import {
  FlowTestSchemaService,
  SchemaFieldInfo,
  SchemaValueSuggestion,
} from "./flowTestSchemaService";

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
  examples?: string[];
  possibleValues?: string[];
  type?: string;
};

const ROOT_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "suite_name",
    type: "string",
    description:
      "Nome amigável do fluxo de teste. Este nome aparece nos relatórios HTML, na árvore do Flow Test Runner e facilita a identificação do teste.",
    examples: [
      "Login de Usuário",
      "Criar Pedido Completo",
      "Validação de API de Produtos"
    ],
  },
  {
    title: "node_id",
    type: "string (kebab-case)",
    description:
      "Identificador único em formato kebab-case. Usado como referência em chamadas entre suites (via 'call.test'), dependências e URLs de relatórios. Recomenda-se usar apenas letras minúsculas, números e hífens.",
    examples: [
      "login-usuario",
      "criar-pedido",
      "validacao-api-produtos"
    ],
  },
  {
    title: "base_url",
    type: "string (URL)",
    description:
      "URL base que será usada como prefixo para todas as requisições HTTP nos steps. Facilita a portabilidade dos testes entre ambientes (dev, staging, produção).",
    examples: [
      "https://api.example.com",
      "http://localhost:3000",
      "${ENV_API_URL}"
    ],
  },
  {
    title: "variables",
    type: "object",
    description:
      "Mapa de variáveis globais disponíveis para todos os passos e cenários do teste. Use variáveis para evitar repetição de valores e facilitar a manutenção. As variáveis podem ser referenciadas usando ${variavel}.",
    examples: [
      "api_version: v1",
      "timeout: 5000",
      "user_id: 12345"
    ],
  },
  {
    title: "depends",
    type: "array",
    description:
      "Lista de node_id de outras suites que devem ser executadas antes desta. Útil para garantir que dados de setup (como criar usuário) sejam executados antes dos testes que dependem deles.",
    examples: [
      "- setup-database",
      "- criar-usuario-teste",
      "- autenticar"
    ],
  },
  {
    title: "exports",
    type: "array",
    description:
      "Lista de nomes de variáveis que serão exportadas deste teste e ficarão disponíveis para outros testes que o chamarem. Útil para compartilhar tokens de autenticação, IDs criados, etc.",
    examples: [
      "- auth_token",
      "- user_id",
      "- order_id"
    ],
  },
  {
    title: "scenarios",
    type: "object",
    description:
      "Define cenários alternativos que permitem executar diferentes conjuntos de steps. Cada cenário substitui os steps padrão, permitindo reutilizar a mesma estrutura de teste com diferentes dados ou fluxos.",
    examples: [
      "sucesso:",
      "  - name: Login bem-sucedido",
      "falha:",
      "  - name: Login com senha inválida"
    ],
  },
  {
    title: "steps",
    type: "array",
    description:
      "Sequência de passos executados pelo Flow Test Engine. Cada step pode conter uma requisição HTTP (request), validações (assert), chamadas para outros testes (call), ou solicitar entrada do usuário (input).",
    examples: [
      "- name: Buscar usuários",
      "  request:",
      "    method: GET",
      "    url: /users"
    ],
  },
];

const STEP_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "name",
    type: "string",
    description: "Nome descritivo do passo. Aparece nos relatórios, logs e na interface do Flow Test Runner para facilitar a identificação de cada etapa do teste.",
    examples: [
      "Login com credenciais válidas",
      "Criar novo produto",
      "Validar resposta da API"
    ],
  },
  {
    title: "step_id",
    type: "string",
    description:
      "Identificador único e estável do passo. Permite executar steps individuais e é útil para retestes granulares. Use formato kebab-case ou snake_case.",
    examples: [
      "login-step",
      "create_product",
      "validate-response"
    ],
  },
  {
    title: "request",
    type: "object",
    description:
      "Configuração de uma requisição HTTP. Inclui método (GET, POST, PUT, DELETE, etc), URL, headers, query parameters e corpo da requisição.",
    examples: [
      "method: GET",
      "url: /api/users/${user_id}",
      "headers:",
      "  Authorization: Bearer ${token}"
    ],
  },
  {
    title: "assert",
    type: "object",
    description:
      "Define regras de validação para a resposta do step. Pode validar status HTTP, conteúdo do corpo, headers, tempo de resposta, entre outros.",
    examples: [
      "status_code: 200",
      "body:",
      "  success: true",
      "  data.length: 10"
    ],
  },
  {
    title: "call",
    type: "object",
    description:
      "Chama outro Flow Test ou um step específico, permitindo a composição e reutilização de testes. Útil para criar testes modulares.",
    examples: [
      "test: autenticacao",
      "test: criar-usuario",
      "step: login-step"
    ],
  },
  {
    title: "input",
    type: "object",
    description:
      "Solicita entrada do usuário durante a execução do teste. Suporta diferentes tipos (text, number, select, boolean) e pode usar valores em cache para execuções subsequentes.",
    examples: [
      "variable: email",
      "prompt: Digite o e-mail",
      "type: text",
      "default: usuario@exemplo.com"
    ],
  },
  {
    title: "scenario",
    type: "string",
    description:
      "Nome do cenário a ser usado para este step. Permite alternar entre diferentes variações de um mesmo teste definidas na seção 'scenarios'.",
    examples: [
      "sucesso",
      "falha",
      "timeout"
    ],
  },
  {
    title: "depends",
    type: "array",
    description:
      "Lista de node_id de outras suites que devem ser executadas antes deste step específico. Útil quando apenas um passo tem dependência externa.",
    examples: [
      "- setup-database",
      "- criar-dados-teste"
    ],
  },
  {
    title: "captures",
    type: "object",
    description:
      "Extrai valores da resposta HTTP e os armazena como variáveis para uso em steps posteriores. Suporta JSONPath para navegação em objetos complexos.",
    examples: [
      "user_id:",
      "  path: data.id",
      "auth_token:",
      "  path: token",
      "  as: AUTH_TOKEN"
    ],
  },
  {
    title: "metadata",
    type: "object",
    description:
      "Metadados adicionais do passo como tags, categoria, autor ou observações. Útil para organização e geração de documentação.",
    examples: [
      "tags:",
      "  - autenticacao",
      "  - critico",
      "author: João Silva"
    ],
  },
];

const CALL_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "test",
    type: "string",
    description:
      "Identificador do fluxo de teste a ser chamado. Pode ser o suite_name, node_id ou caminho relativo do arquivo. O teste chamado será executado completamente ou apenas um step se especificado.",
    examples: [
      "autenticacao",
      "login-usuario",
      "./auth/login.yml"
    ],
  },
  {
    title: "step",
    type: "string",
    description:
      "Opcional. Nome ou step_id de um passo específico dentro do teste chamado. Quando especificado, executa apenas aquele step ao invés da suite completa.",
    examples: [
      "login-step",
      "create_user",
      "validate-token"
    ],
  },
  {
    title: "isolate_context",
    type: "boolean",
    description:
      "Quando true, executa o teste chamado em um contexto isolado, sem compartilhar variáveis com o teste atual. Útil para evitar conflitos de variáveis.",
    possibleValues: ["true", "false"],
    examples: [
      "true",
      "false"
    ],
  },
  {
    title: "on_error",
    type: "string",
    description:
      "Define o comportamento quando o teste/step chamado falha. Opções: 'continue' (continua execução), 'stop' (para execução), 'retry' (tenta novamente).",
    possibleValues: ["continue", "stop", "retry"],
    examples: [
      "continue",
      "stop",
      "retry"
    ],
  },
];

const ASSERT_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "status_code",
    type: "number",
    description: "Valida o código de status HTTP da resposta. Pode ser um número exato ou uma lista de códigos aceitos.",
    possibleValues: ["200", "201", "204", "400", "401", "403", "404", "500"],
    examples: [
      "200",
      "201",
      "[200, 201]"
    ],
  },
  {
    title: "body",
    type: "object",
    description: "Valida o conteúdo do corpo da resposta. Suporta validação de campos específicos, tipos de dados, valores exatos ou padrões. Use notação de ponto para campos aninhados (ex: data.user.name).",
    examples: [
      "success: true",
      "data.id: ${user_id}",
      "items.length: 10",
      "user.email: usuario@exemplo.com"
    ],
  },
  {
    title: "headers",
    type: "object",
    description: "Valida cabeçalhos HTTP específicos da resposta. Útil para verificar Content-Type, autenticação, cache, etc.",
    examples: [
      "Content-Type: application/json",
      "Authorization: Bearer ${token}",
      "Cache-Control: no-cache"
    ],
  },
];

const REQUEST_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "method",
    type: "string",
    description: "Método HTTP da requisição. Define a ação a ser executada no servidor.",
    possibleValues: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    examples: [
      "GET",
      "POST",
      "PUT",
      "DELETE"
    ],
  },
  {
    title: "url",
    type: "string",
    description: "URL ou caminho da requisição. Pode ser relativo (usa base_url) ou absoluto. Suporta interpolação de variáveis com ${variavel}.",
    examples: [
      "/api/users",
      "/users/${user_id}",
      "https://api.example.com/products"
    ],
  },
  {
    title: "headers",
    type: "object",
    description: "Cabeçalhos HTTP da requisição. Usado para autenticação, tipo de conteúdo, etc.",
    examples: [
      "Content-Type: application/json",
      "Authorization: Bearer ${auth_token}",
      "Accept: application/json"
    ],
  },
  {
    title: "query",
    type: "object",
    description: "Parâmetros de query string (URL parameters). Automaticamente codificados e adicionados à URL.",
    examples: [
      "page: 1",
      "limit: 10",
      "search: ${search_term}"
    ],
  },
  {
    title: "body",
    type: "string | object",
    description: "Corpo da requisição. Pode ser JSON (object), string ou conteúdo de arquivo. Usado principalmente com POST, PUT e PATCH.",
    examples: [
      "username: usuario",
      "password: senha123",
      "email: ${user_email}"
    ],
  },
  {
    title: "timeout",
    type: "number",
    description: "Timeout específico para esta requisição em milissegundos. Sobrescreve o timeout global do teste.",
    examples: [
      "5000",
      "10000",
      "30000"
    ],
  },
];

const INPUT_KEY_SUGGESTIONS: DocumentationEntry[] = [
  {
    title: "variable",
    type: "string",
    description: "Nome da variável que armazenará o valor fornecido pelo usuário. Esta variável ficará disponível para os próximos steps usando ${variable}.",
    examples: [
      "email",
      "password",
      "user_id"
    ],
  },
  {
    title: "prompt",
    type: "string",
    description: "Mensagem exibida ao usuário solicitando a entrada. Seja claro e específico sobre o que é esperado.",
    examples: [
      "Digite o e-mail do usuário",
      "Informe a senha",
      "Escolha o ambiente"
    ],
  },
  {
    title: "type",
    type: "string",
    description: "Tipo de entrada solicitada. Define como o valor será coletado e validado.",
    possibleValues: ["text", "number", "select", "boolean", "password"],
    examples: [
      "text",
      "number",
      "select",
      "boolean"
    ],
  },
  {
    title: "default",
    type: "string | number | boolean",
    description: "Valor padrão usado se o usuário não fornecer entrada. Útil para facilitar execuções rápidas.",
    examples: [
      "usuario@exemplo.com",
      "123",
      "true"
    ],
  },
  {
    title: "options",
    type: "array",
    description: "Lista de opções disponíveis quando type é 'select'. O usuário escolherá uma das opções da lista.",
    examples: [
      "- desenvolvimento",
      "- staging",
      "- producao"
    ],
  },
  {
    title: "masked",
    type: "boolean",
    description: "Quando true, oculta o valor digitado (útil para senhas). Funciona apenas com type 'text' ou 'password'.",
    possibleValues: ["true", "false"],
    examples: [
      "true",
      "false"
    ],
  },
];

export class FlowTestLanguageService {
  constructor(
    private readonly index: FlowTestIndex,
    private readonly schemaService: FlowTestSchemaService
  ) {}

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
      const schemaItems = this.getSchemaKeyCompletions(context);
      const fallbackItems = this.getFallbackKeyCompletions(context);
      return this.mergeCompletionItems(schemaItems, fallbackItems);
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
      return this.mergeWithSchemaValues(context, suggestions);
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
      return this.mergeWithSchemaValues(context, items);
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
      return this.mergeWithSchemaValues(context, items);
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
      return this.mergeWithSchemaValues(context, items);
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
      return this.mergeWithSchemaValues(context, items);
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
      return this.mergeWithSchemaValues(context, items);
    }

    const schemaValueItems = this.getSchemaValueCompletions(context);
    if (schemaValueItems.length > 0) {
      return this.mergeCompletionItems(items, schemaValueItems);
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
        markdown.appendMarkdown(`**${docEntry.title}**`);
        
        if (docEntry.type) {
          markdown.appendMarkdown(` \`${docEntry.type}\``);
        }
        markdown.appendMarkdown(`\n\n`);
        markdown.appendMarkdown(docEntry.description);
        
        // Add possible values
        if (docEntry.possibleValues && docEntry.possibleValues.length > 0) {
          markdown.appendMarkdown(`\n\n**Valores possíveis:**\n`);
          docEntry.possibleValues.forEach(value => {
            markdown.appendMarkdown(`- \`${value}\`\n`);
          });
        }
        
        // Add examples
        if (docEntry.examples && docEntry.examples.length > 0) {
          markdown.appendMarkdown(`\n\n**Exemplos:**\n\`\`\`yaml\n`);
          markdown.appendMarkdown(docEntry.examples.join('\n'));
          markdown.appendMarkdown(`\n\`\`\`\n`);
        }
        
        if (docEntry.url) {
          markdown.appendMarkdown(`\n\n[📖 Ver documentação completa](${docEntry.url})`);
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

    if (context.isKey) {
      const schemaHover = this.getSchemaHoverForKey(
        context,
        document,
        position
      );
      if (schemaHover) {
        return schemaHover;
      }
    } else {
      const schemaHover = this.getSchemaHoverForValue(
        context,
        document,
        position
      );
      if (schemaHover) {
        return schemaHover;
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

  private getFallbackKeyCompletions(
    context: CompletionContext
  ): vscode.CompletionItem[] {
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

    if (
      normalizedParent === "steps.*.request" ||
      normalizedParent === "request"
    ) {
      return this.createCompletionsFromDocs(
        REQUEST_KEY_SUGGESTIONS,
        vscode.CompletionItemKind.Field
      );
    }

    if (
      normalizedParent === "steps.*.input" ||
      normalizedParent === "input"
    ) {
      return this.createCompletionsFromDocs(
        INPUT_KEY_SUGGESTIONS,
        vscode.CompletionItemKind.Field
      );
    }

    return [];
  }

  private getSchemaKeyCompletions(
    context: CompletionContext
  ): vscode.CompletionItem[] {
    const fieldInfos = this.schemaService.getKeySuggestions(context.path);
    if (fieldInfos.length === 0) {
      return [];
    }
    return fieldInfos.map((info) => this.createSchemaFieldCompletion(info));
  }

  private getSchemaValueCompletions(
    context: CompletionContext
  ): vscode.CompletionItem[] {
    const fieldInfo = this.schemaService.getFieldInfo(context.path);
    const suggestions = this.schemaService.getValueSuggestions(context.path);

    if (suggestions.length === 0 && !fieldInfo) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];
    suggestions.forEach((suggestion) => {
      items.push(this.createSchemaValueCompletion(suggestion, fieldInfo));
    });

    return items;
  }

  private mergeWithSchemaValues(
    context: CompletionContext,
    completions: vscode.CompletionItem[]
  ): vscode.CompletionItem[] {
    const schemaValues = this.getSchemaValueCompletions(context);
    if (schemaValues.length === 0) {
      return completions;
    }
    return this.mergeCompletionItems(completions, schemaValues);
  }

  private mergeCompletionItems(
    primary: vscode.CompletionItem[],
    secondary: vscode.CompletionItem[]
  ): vscode.CompletionItem[] {
    if (secondary.length === 0) {
      return primary;
    }

    const ordered: vscode.CompletionItem[] = [];
    const seen = new Set<string>();

    const add = (item: vscode.CompletionItem) => {
      const key = this.getCompletionLabelKey(item);
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      ordered.push(item);
    };

    primary.forEach(add);
    secondary.forEach(add);

    return ordered;
  }

  private getCompletionLabelKey(item: vscode.CompletionItem): string {
    const label = item.label;
    if (typeof label === "string") {
      return label.toLowerCase();
    }
    if (label && typeof label.label === "string") {
      return label.label.toLowerCase();
    }
    return "";
  }

  private createSchemaFieldCompletion(
    info: SchemaFieldInfo
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      info.name,
      vscode.CompletionItemKind.Field
    );
    const detail = this.buildFieldDetail(info);
    if (detail) {
      item.detail = detail;
    }
    const markdown = this.createFieldMarkdown(info);
    if (markdown) {
      item.documentation = markdown;
    }
    return item;
  }

  private createSchemaValueCompletion(
    suggestion: SchemaValueSuggestion,
    fieldInfo?: SchemaFieldInfo
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(suggestion.value);

    switch (suggestion.origin) {
      case "enum":
        item.kind = vscode.CompletionItemKind.EnumMember;
        break;
      case "boolean":
        item.kind = vscode.CompletionItemKind.Value;
        item.sortText = `a_${suggestion.value}`;
        break;
      case "default":
        item.kind = vscode.CompletionItemKind.Value;
        item.sortText = `b_${suggestion.value}`;
        break;
      case "example":
        item.kind = vscode.CompletionItemKind.Value;
        item.sortText = `c_${suggestion.value}`;
        break;
      default:
        item.kind = vscode.CompletionItemKind.Value;
        break;
    }

    if (suggestion.description) {
      item.detail = suggestion.description;
    } else if (fieldInfo?.type) {
      item.detail = fieldInfo.type;
    }

    const markdown = this.createFieldMarkdown(fieldInfo);
    if (markdown) {
      item.documentation = markdown;
    }

    return item;
  }

  private buildFieldDetail(info?: SchemaFieldInfo): string | undefined {
    if (!info) {
      return undefined;
    }

    const parts: string[] = [];
    if (info.type) {
      parts.push(info.type);
    }
    if (info.required === true) {
      parts.push("obrigatório");
    } else if (info.required === false) {
      parts.push("opcional");
    }

    if (parts.length === 0) {
      return undefined;
    }

    return parts.join(" · ");
  }

  private createFieldMarkdown(
    info?: SchemaFieldInfo
  ): vscode.MarkdownString | undefined {
    if (!info) {
      return undefined;
    }

    const lines: string[] = [];
    lines.push(`**${info.name}**`);

    if (info.type) {
      lines.push("");
      lines.push(`Tipo: \`${info.type}\``);
    }

    if (info.required !== undefined) {
      lines.push("");
      lines.push(
        `Obrigatoriedade: ${info.required ? "Obrigatório" : "Opcional"}`
      );
    }

    if (info.description) {
      lines.push("");
      lines.push(info.description);
    }

    if (info.enumValues && info.enumValues.length > 0) {
      lines.push("");
      lines.push("Valores permitidos:");
      info.enumValues.forEach((entry) => {
        const description = entry.description
          ? ` — ${entry.description}`
          : "";
        lines.push(`- \`${entry.value}\`${description}`);
      });
    }

    if (info.examples && info.examples.length > 0) {
      lines.push("");
      lines.push("Exemplos:");
      info.examples.forEach((example) => {
        lines.push(`- \`${example}\``);
      });
    }

    if (info.defaultValue) {
      lines.push("");
      lines.push(`Valor padrão: \`${info.defaultValue}\``);
    }

    if (info.documentationUrl) {
      lines.push("");
      lines.push(`[Documentação](${info.documentationUrl})`);
    }

    const markdown = new vscode.MarkdownString(lines.join("\n"));
    markdown.isTrusted = true;
    return markdown;
  }

  private getSchemaHoverForKey(
    context: CompletionContext,
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (!context.currentKey) {
      return undefined;
    }

    const info = this.schemaService.getFieldInfoForKey(
      context.path,
      context.currentKey
    );
    if (!info) {
      return undefined;
    }

    const markdown = this.createFieldMarkdown(info);
    if (!markdown) {
      return undefined;
    }

    const range = document.getWordRangeAtPosition(position, /[\w._-]+/);
    return new vscode.Hover(markdown, range);
  }

  private getSchemaHoverForValue(
    context: CompletionContext,
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const info = this.schemaService.getFieldInfo(context.path);
    if (!info) {
      return undefined;
    }

    const markdown = this.createFieldMarkdown(info);
    if (!markdown) {
      return undefined;
    }

    const range = document.getWordRangeAtPosition(position, /[\w./-]+/);
    return new vscode.Hover(markdown, range);
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
      
      // Set detail with type information
      if (entry.type) {
        item.detail = `${entry.type}`;
      }
      
      // Create rich markdown documentation
      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`**${entry.title}**`);
      
      if (entry.type) {
        markdown.appendMarkdown(` \`${entry.type}\``);
      }
      markdown.appendMarkdown(`\n\n`);
      markdown.appendMarkdown(entry.description);
      
      // Add possible values
      if (entry.possibleValues && entry.possibleValues.length > 0) {
        markdown.appendMarkdown(`\n\n**Valores possíveis:**\n`);
        entry.possibleValues.forEach(value => {
          markdown.appendMarkdown(`- \`${value}\`\n`);
        });
      }
      
      // Add examples
      if (entry.examples && entry.examples.length > 0) {
        markdown.appendMarkdown(`\n\n**Exemplos:**\n\`\`\`yaml\n`);
        markdown.appendMarkdown(entry.examples.join('\n'));
        markdown.appendMarkdown(`\n\`\`\`\n`);
      }
      
      if (entry.url) {
        markdown.appendMarkdown(`\n\n[📖 Ver documentação completa](${entry.url})`);
        markdown.isTrusted = true;
      }
      
      item.documentation = markdown;
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
    if (
      normalizedParent === "steps.*.request" ||
      normalizedParent === "request"
    ) {
      return lookup(REQUEST_KEY_SUGGESTIONS, key);
    }
    if (
      normalizedParent === "steps.*.input" ||
      normalizedParent === "input"
    ) {
      return lookup(INPUT_KEY_SUGGESTIONS, key);
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
