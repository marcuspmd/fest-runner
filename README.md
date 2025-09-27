# Flow Test Runner

Uma extensão VS Code para executar e gerenciar testes do Flow Test Engine diretamente no editor.

## Funcionalidades

- **Descoberta Automática**: Encontra automaticamente arquivos de teste Flow (`.yml`/`.yaml`)
- **Visualização em Árvore**: Exibe suites e steps de teste em um painel lateral
- **Execução de Testes**: Execute testes individuais ou suites completas
- **Indicadores Visuais**: Ícones que mostram o status dos testes (pendente/executando/passou/falhou)
- **Output Integrado**: Resultados dos testes exibidos no canal de output do VS Code

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

## Comandos

- `flow-test-runner.refresh`: Atualizar lista de testes
- `flow-test-runner.runTest`: Executar teste selecionado
- `flow-test-runner.runSuite`: Executar suite completa
- `flow-test-runner.openTest`: Abrir arquivo de teste

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Compilar
npm run compile

# Executar em modo watch
npm run watch
```

Para testar a extensão, pressione F5 para abrir uma nova janela do VS Code com a extensão carregada.