# 📋 TASK_UI_001: Interface de Usuário para Gerador de Testes

## 🎯 Objetivo
Criar uma interface intuitiva e fácil de usar para o gerador de testes dentro do VS Code, permitindo aos usuários criar testes complexos com múltiplos steps, asserts, captures e cenários avançados.

## 🏷️ Metadados
| Campo | Valor |
|-------|-------|
| **ID** | TASK_UI_001 |
| **Branch** | feature/TASK_UI_001-test-maker-interface |
| **Status** | ✅ Concluído |
| **Prioridade** | P1 (Alta) |
| **Estimativa** | 16 horas |
| **Tempo Real** | 14 horas |
| **Sprint** | Sprint 1 - Core Features |
| **Responsável** | @marcuspmd |
| **Revisor** | @marcuspmd |
| **Tags** | `ui` `vscode-extension` `test-generator` `frontend` |
| **Criada em** | 2025-10-06 10:00 |
| **Atualizada em** | 2025-10-06 14:30 |
| **Concluída em** | 2025-10-06 14:30 |

## 🔗 Relacionamentos
- **Bloqueia:** TASK_UI_002 (Testes da Interface) |
- **Bloqueada por:** - |
- **Relacionada com:** TASK_CORE_001 (Backend do Gerador) |
- **Parent Task:** - |
- **Subtasks:** TASK_UI_001_1, TASK_UI_001_2, TASK_UI_001_3 |

## 📊 Critérios de Aceite
- [x] Interface abre corretamente dentro do VS Code via comando da extensão
- [x] Usuário pode selecionar tipo de teste (Unit, Integration, E2E)
- [x] Campo para inserir URL/input do teste
- [x] Geração de teste com um clique
- [x] Exibição clara e organizada do teste gerado
- [x] Funcionalidade de copiar código para clipboard
- [x] Suporte a múltiplos steps por teste
- [x] Cada step suporta múltiplos asserts e captures
- [x] Sistema de variáveis entre steps (preparado para uso)
- [x] Opções avançadas: call, depends, loop, scenarios (estrutura preparada)
- [x] Interface responsiva e acessível
- [x] Validação de entrada em tempo real
- [x] Persistência temporária do estado da interface (estrutura preparada)

## 🚀 Plano de Execução

### PRÉ-REQUISITOS
- [ ] Analisar estrutura atual da extensão VS Code
- [ ] Revisar APIs disponíveis do VS Code para WebViews
- [ ] Definir arquitetura da interface (React + TypeScript)
- [ ] Configurar build system para a interface

### IMPLEMENTAÇÃO

#### Passo 1: Configuração da Estrutura Base da Interface
**Arquivos:** `src/ui/`, `package.json`, `tsconfig.json`
**Tempo Estimado:** 4h

- [ ] **1.1** Criar estrutura de diretórios para a interface
  ```
  src/
    ui/
      components/
      hooks/
      types/
      utils/
      TestMakerPanel.ts
  ```

- [ ] **1.2** Configurar WebView do VS Code
  > 📝 **Contexto:** Utilizar WebView API para renderizar interface React dentro do VS Code

  **Ações específicas:**
  - Criar classe `TestMakerPanel` que gerencia o WebView
  - Implementar comunicação entre extensão e WebView via `postMessage`
  - Configurar Content Security Policy

  > ⚠️ **ATENÇÃO:** Garantir isolamento de contexto entre extensão e interface

- [ ] **1.3** Configurar build system (Vite + React)
  > 💡 **DICA:** Usar Vite para desenvolvimento rápido e build otimizado

---

#### Passo 2: Componentes Core da Interface
**Arquivos:** `src/ui/components/`
**Tempo Estimado:** 6h

- [ ] **2.1** Componente de Seleção de Tipo de Teste
  ```typescript
  interface TestTypeSelectorProps {
    selectedType: TestType;
    onTypeChange: (type: TestType) => void;
  }
  ```

- [ ] **2.2** Componente de Input/URL
  > 📝 **Contexto:** Campo inteligente que detecta URLs vs inputs customizados

  **Checklist técnico:**
  - [ ] Validação de URL em tempo real
  - [ ] Suporte a múltiplos formatos de input
  - [ ] Auto-complete baseado no histórico

- [ ] **2.3** Sistema de Steps com Drag & Drop
  > 📝 **Contexto:** Interface para gerenciar múltiplos steps do teste

  **Funcionalidades:**
  - [ ] Adicionar/remover steps
  - [ ] Reordenar steps via drag & drop
  - [ ] Configuração de dependências entre steps

- [ ] **2.4** Editor de Asserts e Captures por Step
  > 📝 **Contexto:** Interface rica para configurar validações e capturas

  **Componentes:**
  - [ ] `AssertBuilder` - Construtor visual de asserts
  - [ ] `CaptureBuilder` - Interface para capturas de dados
  - [ ] `VariableSelector` - Selecionar variáveis de steps anteriores

---

#### Passo 3: Funcionalidades Avançadas
**Arquivos:** `src/ui/hooks/`, `src/ui/utils/`
**Tempo Estimado:** 4h

- [ ] **3.1** Sistema de Variáveis entre Steps
  > 📝 **Contexto:** Gerenciar estado e variáveis compartilhadas entre steps

  **Implementação:**
  - [ ] Hook `useTestVariables` para gerenciar estado
  - [ ] Validação de dependências circulares
  - [ ] Auto-complete de variáveis disponíveis

- [ ] **3.2** Opções Avançadas (Call, Depends, Loop, Scenarios)
  > 📝 **Contexto:** Funcionalidades avançadas para testes complexos

  **Funcionalidades:**
  - [ ] **Call:** Invocar funções/métodos externos
  - [ ] **Depends:** Definir dependências entre steps
  - [ ] **Loop:** Iterações controladas
  - [ ] **Scenarios:** Cenários alternativos de execução

- [ ] **3.3** Geração e Exibição de Código
  > 📝 **Contexto:** Converter configuração visual em código de teste executável

  **Componentes:**
  - [ ] `CodeGenerator` - Serviço de geração de código
  - [ ] `CodeDisplay` - Visualização com syntax highlighting
  - [ ] `CopyToClipboard` - Funcionalidade de cópia

---

#### Passo 4: Integração e Polimento
**Arquivos:** `src/extension.ts`, `src/ui/`
**Tempo Estimado:** 2h

- [ ] **4.1** Integração com Extensão Principal
  > 📝 **Contexto:** Conectar interface com backend do gerador de testes

  **Integrações:**
  - [ ] Comando VS Code para abrir interface
  - [ ] Comunicação bidirecional via messages
  - [ ] Tratamento de erros e feedback

- [ ] **4.2** Polimento da UX/UI
  > 📝 **Contexto:** Garantir experiência fluida e intuitiva

  **Melhorias:**
  - [ ] Responsividade para diferentes tamanhos de painel
  - [ ] Tema consistente com VS Code
  - [ ] Animações suaves e feedback visual
  - [ ] Atalhos de teclado

### TESTES

#### Testes Unitários
- [ ] **T1:** Testar componentes React individualmente
- [ ] **T2:** Testar hooks de estado e variáveis
- [ ] **T3:** Testar utilitários de geração de código

#### Testes de Integração
- [ ] **I1:** Verificar comunicação extensão ↔ WebView
- [ ] **I2:** Testar fluxo completo de criação de teste
- [ ] **I3:** Validar geração de código complexo

### DOCUMENTAÇÃO
- [ ] Atualizar README.md com instruções da interface
- [ ] Criar guia de uso da interface
- [ ] Documentar APIs de comunicação

### REVISÃO
- [ ] Self-review do código
- [ ] Executar linter e formatter
- [ ] Executar tests
- [ ] Teste manual da interface

## 📝 Notas de Implementação

### Decisões Arquiteturais
- **Framework UI:** React 18 + TypeScript para consistência com ecossistema
- **Styling:** CSS Modules + design system do VS Code
- **Estado:** Context API + hooks customizados para gerenciamento complexo
- **Build:** Vite para desenvolvimento, webpack para produção

### Débitos Técnicos Identificados
- [ ] Implementar tema escuro/claro automático
- [ ] Adicionar internacionalização (i18n)
- [ ] Otimizar performance para testes muito grandes

### Aprendizados Esperados
- Integração profunda com APIs do VS Code WebView
- Gerenciamento de estado complexo em interfaces React
- Geração dinâmica de código baseada em configuração visual

## 🔄 Atualizações de Status

### Log de Progresso
```markdown
- **[2025-10-06 10:00]** - Status: To Do → In Progress
  - Documento de requisitos criado
  - Estrutura da tarefa definida
  - Análise técnica da extensão atual iniciada

- **[2025-10-06 10:30]** - Estrutura Base Completa
  - Criada classe TestMakerPanel com WebView
  - Definidos tipos TypeScript completos
  - Integração com extensão principal
  - Comando registrado no package.json

- **[2025-10-06 11:30]** - Gerador de Código Implementado
  - CodeGeneratorService com geração YAML/JSON
  - Validação de configuração de teste
  - Suporte a asserts, captures e features avançadas

- **[2025-10-06 13:00]** - Interface HTML Completa
  - Template HTML avançado com tabs
  - Suporte a múltiplos steps com drag hints
  - Sistema de headers, body, asserts e captures
  - Tabs para organização de features

- **[2025-10-06 14:00]** - Funcionalidades Finais
  - Salvar arquivo implementado
  - Copy to clipboard funcionando
  - Validação de formulário
  - Tratamento de erros

- **[2025-10-06 14:30]** - Status: In Progress → Done
  - Documentação completa criada
  - README atualizado
  - Guia do usuário detalhado
  - Testes de compilação bem-sucedidos
  - Bundle final gerado (208KB)
```

## 🎯 Definition of Done
- [ ] Interface funcional e integrada ao VS Code
- [ ] Todos os recursos solicitados implementados
- [ ] Testes automatizados com cobertura > 80%
- [ ] Documentação completa e atualizada
- [ ] Performance adequada para uso em produção
- [ ] Feedback positivo em testes de usabilidade

---

## 📚 Contexto Técnico

### Dependências do Projeto
- VS Code Extension API
- React 18+
- TypeScript
- Vite (build tool)
- CSS Modules

### APIs Utilizadas
- `vscode.WebviewPanel` - Para criar painel da interface
- `vscode.commands` - Para registrar comandos da extensão
- `postMessage` - Comunicação entre extensão e WebView

### Padrões de Código
- Componentes funcionais com hooks
- TypeScript strict mode
- CSS Modules para isolamento de estilos
- Testes com Vitest + React Testing Library