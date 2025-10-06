# Flow Test Runner

Uma extensão VS Code para executar e gerenciar testes do Flow Test Engine diretamente no editor.

## ✨ Funcionalidades

### 🧪 Test Maker (NOVO!)
- **Interface Visual**: Crie testes complexos sem escrever YAML manualmente
- **Editor de Steps**: Configure requisições HTTP com interface intuitiva
- **Assertions Visuais**: Adicione validações com construtores visuais
- **Captures**: Extraia variáveis de respostas para usar em steps seguintes
- **Geração de Código**: Gera YAML/JSON automaticamente
- **Salvar Arquivo**: Salve testes diretamente no seu workspace

[📖 Ver Guia Completo do Test Maker](docs/TEST_MAKER_GUIDE.md)

### 🔄 Execução de Testes
- **Descoberta Automática**: Encontra automaticamente arquivos de teste Flow (`.yml`/`.yaml`)
- **Visualização em Árvore**: Exibe suites e steps de teste em um painel lateral
- **Execução de Testes**: Execute testes individuais ou suites completas
- **Indicadores Visuais**: Ícones que mostram o status dos testes (pendente/executando/passou/falhou)
- **Output Integrado**: Resultados dos testes exibidos no canal de output do VS Code

## Requisitos

- VS Code 1.74.0 ou superior
- Node.js 16+ instalado
- Flow Test Engine (`npm install -g flow-test-engine`)

## 🚀 Quick Start

### Criando um Novo Teste

1. Abra a Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Digite "Open Test Maker"
3. Selecione "Flow Test Runner: Open Test Maker"
4. Configure seu teste usando a interface visual:
   - Defina nome e tipo do teste
   - Adicione steps com requisições HTTP
   - Configure assertions e captures
   - Clique em "Generate Test"
5. Salve o arquivo gerado no seu workspace

### Executando Testes Existentes

1. Abra um workspace que contenha arquivos de teste Flow Test (`.yml` ou `.yaml`)
2. O painel "Flow Tests" aparecerá na barra lateral do Explorer
3. Clique nos ícones de play para executar testes individuais ou suites
4. Veja os resultados no canal "Flow Test Runner" no Output

## Comandos

### Test Maker
- `flow-test-runner.openTestMaker`: Abrir Test Maker (interface visual)

### Execução de Testes
- `flow-test-runner.refresh`: Atualizar lista de testes
- `flow-test-runner.runTest`: Executar teste selecionado
- `flow-test-runner.runSuite`: Executar suite completa
- `flow-test-runner.runWithCache`: Executar usando valores em cache
- `flow-test-runner.openTest`: Abrir arquivo de teste

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
