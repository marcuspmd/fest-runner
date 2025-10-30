# Flow Test Runner

Uma extensão VS Code para executar e gerenciar testes do Flow Test Engine diretamente no editor.

## Funcionalidades

- **Descoberta Automática**: Encontra automaticamente arquivos de teste Flow (`.yml`/`.yaml`)
- **Visualização em Árvore**: Exibe suites e steps de teste em um painel lateral
- **Execução de Testes**: Execute testes individuais ou suites completas
- **Indicadores Visuais**: Ícones que mostram o status dos testes (pendente/executando/passou/falhou)
- **Output Integrado**: Resultados dos testes exibidos no canal de output do VS Code
- **Importação cURL**: Importa e executa comandos cURL diretamente, convertendo-os em testes Flow
- **Importação/Exportação**: Suporte para Swagger/OpenAPI e Postman Collections

## Requisitos

- VS Code 1.74.0 ou superior
- Node.js 16+ instalado
- Flow Test Engine (`npm install -g flow-test-engine`)

## Como Usar

1. Abra um workspace que contenha arquivos de teste Flow Test (`.yml` ou `.yaml`)
2. O painel "Flow Tests" aparecerá na barra lateral do Explorer
3. Clique nos ícones de play para executar testes individuais ou suites
4. Veja os resultados no canal "Flow Test Runner" no Output

## Estrutura de Arquivos de Teste

A extensão reconhece arquivos YAML com a estrutura do Flow Test Engine:

```yaml
suite_name: "API Tests"
base_url: "https://api.example.com"

steps:
  - name: "Test endpoint"
    request:
      method: "GET"
      url: "/health"
    assert:
      status_code: 200
```

## Configuração

Você pode ajustar o comportamento da descoberta de testes criando um arquivo `flow-test.config.yml` (ou usando o `test-config.yml` deste repositório como base). Um exemplo de configuração focada em projetos grandes:

```yaml
command: flow-test-engine
test_directory: ./tests

interactive_inputs: true

discovery:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/tests/**/*.yaml"
  exclude:
    - "**/temp/**"
    - "**/node_modules/**"
    - "**/results/**"
```

Também é possível monitorar múltiplas pastas com `test_directories`:

```yaml
test_directories:
  - ./tests
  - ./integration-tests
```

## Comandos

- `flow-test-runner.refresh`: Atualizar lista de testes
- `flow-test-runner.runTest`: Executar teste selecionado
- `flow-test-runner.runSuite`: Executar suite completa
- `flow-test-runner.runWithCache`: Executar usando valores em cache
- `flow-test-runner.openTest`: Abrir arquivo de teste
- `flow-test-runner.importCurl`: Importar/executar comando cURL
- `flow-test-runner.importSwagger`: Importar Swagger/OpenAPI
- `flow-test-runner.importPostman`: Importar Postman Collection
- `flow-test-runner.exportPostman`: Exportar para Postman

### Importação de cURL

A extensão permite importar comandos cURL diretamente através de um botão de ação rápida no painel de testes:

1. Clique no botão "Import/Execute cURL" (ícone de terminal) no painel Flow Tests
2. Cole seu comando cURL (exemplo: `curl -X GET https://api.example.com/users`)
3. Escolha entre:
   - **Execute and Convert**: Executa o cURL e converte para teste Flow
   - **Convert Only**: Apenas converte para teste Flow sem executar
4. Opcionalmente salve como arquivo de teste YAML
5. Visualize os resultados no painel de output

Exemplo de uso:
```bash
curl -X POST https://api.example.com/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

Este comando será convertido em um teste Flow que você pode salvar e executar posteriormente.

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Compilar (typecheck + bundle)
npm run build

# Executar em modo watch
npm run watch
```

Para testar a extensão, pressione F5 para abrir uma nova janela do VS Code com a extensão carregada.
