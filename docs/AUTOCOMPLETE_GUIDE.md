# Guia de Autocomplete Aprimorado - Flow Test Runner

Este guia explica como usar os recursos aprimorados de autocomplete (IntelliSense) ao criar arquivos de teste YAML do Flow Test Engine.

## 📋 Visão Geral

O Flow Test Runner agora fornece autocomplete inteligente e rico em documentação ao editar arquivos `.yml` e `.yaml`. Ao pressionar `Ctrl+Space` (ou `Cmd+Space` no macOS), você receberá sugestões contextuais com:

- **Descrições detalhadas**: Explicações completas de cada campo
- **Exemplos práticos**: Exemplos de código YAML prontos para usar
- **Valores possíveis**: Listas de opções válidas para enums
- **Informações de tipo**: Tipo de dado esperado (string, number, boolean, etc.)

## 🎯 Campos Principais do Flow Test

### Nível Raiz (Suite)

Ao começar um novo arquivo de teste, o autocomplete sugere os seguintes campos:

#### `suite_name` 
**Tipo**: `string`

Nome amigável do fluxo de teste que aparece em relatórios e na interface.

**Exemplos**:
```yaml
suite_name: Login de Usuário
suite_name: Criar Pedido Completo
suite_name: Validação de API de Produtos
```

#### `node_id`
**Tipo**: `string (kebab-case)`

Identificador único usado para referências entre testes e em relatórios.

**Exemplos**:
```yaml
node_id: login-usuario
node_id: criar-pedido
node_id: validacao-api-produtos
```

#### `base_url`
**Tipo**: `string (URL)`

URL base para todas as requisições HTTP do teste.

**Exemplos**:
```yaml
base_url: https://api.example.com
base_url: http://localhost:3000
base_url: ${ENV_API_URL}
```

#### `variables`
**Tipo**: `object`

Variáveis globais disponíveis em todos os passos do teste.

**Exemplos**:
```yaml
variables:
  api_version: v1
  timeout: 5000
  user_id: 12345
```

#### `steps`
**Tipo**: `array`

Lista de passos executados pelo Flow Test Engine.

**Exemplos**:
```yaml
steps:
  - name: Buscar usuários
    request:
      method: GET
      url: /users
```

### Campos de Step

Ao adicionar um novo passo dentro de `steps`, o autocomplete sugere:

#### `name`
**Tipo**: `string`

Nome descritivo do passo que aparece em relatórios e logs.

**Exemplos**:
```yaml
name: Login com credenciais válidas
name: Criar novo produto
name: Validar resposta da API
```

#### `request`
**Tipo**: `object`

Configuração de uma requisição HTTP.

**Exemplos**:
```yaml
request:
  method: GET
  url: /api/users/${user_id}
  headers:
    Authorization: Bearer ${token}
```

#### `assert`
**Tipo**: `object`

Validações sobre a resposta do step.

**Exemplos**:
```yaml
assert:
  status_code: 200
  body:
    success: true
    data.length: 10
```

#### `call`
**Tipo**: `object`

Chama outro Flow Test ou step específico.

**Exemplos**:
```yaml
call:
  test: autenticacao
  step: login-step
```

#### `input`
**Tipo**: `object`

Solicita entrada do usuário durante a execução.

**Exemplos**:
```yaml
input:
  variable: email
  prompt: Digite o e-mail
  type: text
  default: usuario@exemplo.com
```

### Campos de Request

Dentro de `request`, o autocomplete sugere:

#### `method`
**Tipo**: `string`

**Valores possíveis**:
- `GET` - Recupera dados do servidor
- `POST` - Cria um novo recurso
- `PUT` - Atualiza completamente um recurso
- `PATCH` - Atualiza parcialmente um recurso
- `DELETE` - Remove um recurso
- `HEAD` - Retorna apenas headers
- `OPTIONS` - Retorna métodos suportados

**Exemplos**:
```yaml
method: GET
method: POST
method: DELETE
```

#### `url`
**Tipo**: `string`

Caminho ou URL completa da requisição. Suporta variáveis com `${variavel}`.

**Exemplos**:
```yaml
url: /api/users
url: /users/${user_id}
url: https://api.example.com/products
```

#### `headers`
**Tipo**: `object`

Cabeçalhos HTTP da requisição.

**Exemplos**:
```yaml
headers:
  Content-Type: application/json
  Authorization: Bearer ${auth_token}
  Accept: application/json
```

#### `body`
**Tipo**: `string | object`

Corpo da requisição (para POST, PUT, PATCH).

**Exemplos**:
```yaml
body:
  username: usuario
  password: senha123
  email: ${user_email}
```

### Campos de Assert

Dentro de `assert`, o autocomplete sugere:

#### `status_code`
**Tipo**: `number`

**Valores possíveis**:
- `200` - OK - Requisição bem-sucedida
- `201` - Created - Recurso criado
- `204` - No Content - Sucesso sem retorno
- `400` - Bad Request - Requisição malformada
- `401` - Unauthorized - Autenticação necessária
- `403` - Forbidden - Sem permissão
- `404` - Not Found - Não encontrado
- `422` - Unprocessable Entity - Validação falhou
- `500` - Internal Server Error - Erro no servidor
- `502` - Bad Gateway
- `503` - Service Unavailable

**Exemplos**:
```yaml
status_code: 200
status_code: 201
status_code: [200, 201]
```

#### `body`
**Tipo**: `object`

Validações sobre o corpo da resposta. Use notação de ponto para campos aninhados.

**Exemplos**:
```yaml
body:
  success: true
  data.id: ${user_id}
  items.length: 10
  user.email: usuario@exemplo.com
```

#### `headers`
**Tipo**: `object`

Validações sobre cabeçalhos da resposta.

**Exemplos**:
```yaml
headers:
  Content-Type: application/json
  Authorization: Bearer ${token}
  Cache-Control: no-cache
```

### Campos de Input

Dentro de `input`, o autocomplete sugere:

#### `type`
**Tipo**: `string`

**Valores possíveis**:
- `text` - Entrada de texto livre
- `number` - Entrada numérica
- `select` - Seleção de lista
- `boolean` - Verdadeiro ou falso
- `password` - Entrada oculta

**Exemplos**:
```yaml
type: text
type: select
type: boolean
```

#### `variable`
**Tipo**: `string`

Nome da variável que armazenará o valor.

**Exemplos**:
```yaml
variable: email
variable: password
variable: user_id
```

#### `prompt`
**Tipo**: `string`

Mensagem exibida ao usuário.

**Exemplos**:
```yaml
prompt: Digite o e-mail do usuário
prompt: Informe a senha
prompt: Escolha o ambiente
```

### Campos de Call

Dentro de `call`, o autocomplete sugere:

#### `test`
**Tipo**: `string`

Identificador do teste a ser chamado (suite_name, node_id ou caminho).

**Exemplos**:
```yaml
test: autenticacao
test: login-usuario
test: ./auth/login.yml
```

#### `on_error`
**Tipo**: `string`

**Valores possíveis**:
- `continue` - Continua execução com erro
- `stop` - Para execução
- `retry` - Tenta novamente

**Exemplos**:
```yaml
on_error: continue
on_error: stop
on_error: retry
```

## 💡 Dicas de Uso

### 1. Autocomplete Contextual

O autocomplete é sensível ao contexto. Diferentes sugestões aparecem dependendo de onde você está no arquivo:

- **Nível raiz**: Sugere campos da suite (suite_name, node_id, steps, etc.)
- **Dentro de steps**: Sugere campos de step (name, request, assert, call, input, etc.)
- **Dentro de request**: Sugere campos de requisição (method, url, headers, body, etc.)
- **Para valores**: Sugere valores apropriados (GET/POST para method, 200/404 para status_code, etc.)

### 2. Hover para Documentação

Posicione o mouse sobre qualquer campo para ver documentação detalhada:
- Descrição completa do campo
- Tipo de dado esperado
- Valores possíveis (quando aplicável)
- Exemplos de uso

### 3. Snippets de Código

Ao selecionar uma sugestão, pressione Tab para inserir o campo. Para campos de objeto, você receberá um template básico:

```yaml
request:
  method: 
  url: 
```

### 4. Validação em Tempo Real

O editor VS Code validará seu YAML automaticamente:
- Destaca erros de sintaxe
- Avisa sobre campos desconhecidos
- Sugere correções via Quick Fix (💡)

## 🚀 Exemplos Completos

### Exemplo 1: Teste Simples de API

```yaml
suite_name: Teste de Listagem de Usuários
node_id: listar-usuarios
base_url: https://api.example.com

steps:
  - name: Buscar lista de usuários
    step_id: get-users
    request:
      method: GET
      url: /api/v1/users
      headers:
        Accept: application/json
    assert:
      status_code: 200
      body:
        success: true
```

### Exemplo 2: Teste com Autenticação e Criação

```yaml
suite_name: Criar Produto com Autenticação
node_id: criar-produto-auth
base_url: https://api.example.com

variables:
  admin_token: ${ADMIN_TOKEN}

steps:
  - name: Autenticar usuário
    step_id: login
    request:
      method: POST
      url: /auth/login
      headers:
        Content-Type: application/json
      body:
        username: admin
        password: ${ADMIN_PASSWORD}
    assert:
      status_code: 200
    captures:
      auth_token:
        path: data.token

  - name: Criar novo produto
    step_id: create-product
    request:
      method: POST
      url: /api/products
      headers:
        Authorization: Bearer ${auth_token}
        Content-Type: application/json
      body:
        name: Produto Teste
        price: 99.90
    assert:
      status_code: 201
      body:
        success: true
```

### Exemplo 3: Teste com Input do Usuário

```yaml
suite_name: Buscar Usuário por Email
node_id: buscar-usuario-email

steps:
  - input:
      variable: search_email
      prompt: Digite o e-mail do usuário para buscar
      type: text
      default: teste@exemplo.com

  - name: Buscar usuário
    request:
      method: GET
      url: /users/search
      query:
        email: ${search_email}
    assert:
      status_code: 200
```

## 🔧 Solução de Problemas

### Autocomplete não aparece

1. Certifique-se de que o arquivo tem extensão `.yml` ou `.yaml`
2. Pressione `Ctrl+Space` (ou `Cmd+Space`) manualmente
3. Verifique se a extensão Flow Test Runner está instalada e ativada

### Sugestões incorretas

1. Verifique a indentação do YAML (use 2 espaços, não tabs)
2. Certifique-se de que está no contexto correto do arquivo
3. Recarregue a janela do VS Code (`Ctrl+Shift+P` → "Reload Window")

### Documentação não aparece no hover

1. Aguarde alguns segundos após abrir o arquivo (inicialização pode levar um momento)
2. Verifique se não há erros de sintaxe no arquivo
3. Tente recarregar a extensão

## 📚 Recursos Adicionais

- [Documentação do Flow Test Engine](https://github.com/marcuspmd/fest-runner)
- [Exemplos de Testes](../tasks/example-test.yml)
- [Guia do Test Maker](./TEST_MAKER_GUIDE.md)

## 🤝 Contribuindo

Encontrou algum problema ou tem sugestões para melhorar o autocomplete? Abra uma issue no GitHub!
