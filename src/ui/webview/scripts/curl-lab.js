/**
 * curl-lab.js - cURL import and request execution utilities
 *
 * Provides helpers to parse curl commands, convert them into Flow Test Engine
 * steps, execute HTTP requests, and generate JMESPath suggestions from responses.
 */

const CurlLab = (function() {
  'use strict';

  const DATA_FLAGS = new Set([
    '-d',
    '--data',
    '--data-raw',
    '--data-ascii',
    '--data-binary',
    '--data-urlencode'
  ]);

  const HEADER_FLAGS = new Set(['-h', '--header']);
  const METHOD_FLAGS = new Set(['-x', '--request']);
  const URL_FLAGS = new Set(['--url']);

  const IGNORED_FLAGS = new Set([
    '--compressed',
    '--insecure',
    '--location',
    '--location-trusted',
    '--globoff',
    '-s',
    '--silent',
    '-S',
    '--show-error',
    '--no-progress-meter',
    '--proto-default',
    '--http1.1',
    '--http2'
  ]);

  const DISALLOWED_STEP_HEADERS = new Set([
    'content-length',
    'host',
    'accept-encoding'
  ]);

  const EXECUTION_HEADER_BLOCKLIST = new Set([
    'cache-control',
    'pragma',
    'dnt',
    'origin',
    'referer',
    'cookie',
    'content-length',
    'accept-encoding',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-dest',
    'sec-fetch-user',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests'
    // Note: x-correlation-id and x-store-code are NOT blocked
    // They will be sent with requests for proper API authentication
  ]);

  /**
   * Internal module state
   */
  let state = {
    rawCommand: '',
    parseError: null,
    parsedRequest: null,
    warnings: [],
    response: null,
    runError: null,
    isRunning: false,
    lastStepIndex: null,
    executionAdjustments: [],
    usedProxy: false,
    formInputs: {
      stepName: '',
      stepId: '',
      target: 'new',
      captureVariable: ''
    }
  };

  const listeners = [];

  /**
   * Public: get immutable copy of state
   */
  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener
   * @returns {Function} unsubscribe
   */
  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify listeners of state change
   */
  function notify() {
    const snapshot = getState();
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('CurlLab listener error:', error);
      }
    });
  }

  /**
   * Reset internal state
   */
  function clear() {
    state = {
      rawCommand: '',
      parseError: null,
      parsedRequest: null,
      warnings: [],
      response: null,
      runError: null,
      isRunning: false,
      lastStepIndex: null,
      executionAdjustments: [],
      usedProxy: false,
      formInputs: {
        stepName: '',
        stepId: '',
        target: 'new',
        captureVariable: ''
      }
    };
    notify();
  }

  /**
   * Parse curl command and update state
   * @param {string} command
   */
  function parseCommand(command) {
    state.rawCommand = command || '';
    state.parseError = null;
    state.parsedRequest = null;
    state.response = null;
    state.runError = null;
    state.warnings = [];
    state.executionAdjustments = [];
    state.usedProxy = false;

    const trimmed = (command || '').trim();

    if (!trimmed) {
      notify();
      return;
    }

    const normalized = normalizeCommand(trimmed);
    const tokens = tokenize(normalized);

    if (tokens.length === 0) {
      state.parseError = 'Não foi possível entender o comando cURL.';
      notify();
      return;
    }

    if (tokens[0].toLowerCase() === 'curl') {
      tokens.shift();
    }

    const parsed = interpretTokens(tokens);

    if (parsed.error) {
      state.parseError = parsed.error;
      state.warnings = parsed.warnings || [];
      notify();
      return;
    }

    parsed.suggestions = [];
    state.parsedRequest = parsed;
    state.warnings = parsed.warnings || [];
    state.formInputs = {
      stepName: parsed.defaultStepName,
      stepId: '',
      target: 'new',
      captureVariable: state.formInputs ? state.formInputs.captureVariable || '' : ''
    };
    notify();
  }

  /**
   * Execute parsed request using fetch API
   */
  async function runParsedRequest() {
    if (!state.parsedRequest) {
      state.runError = 'Nenhum request válido para executar.';
      notify();
      return;
    }

    const request = state.parsedRequest;
    const url = request.absoluteUrlWithQuery || request.absoluteUrl;

    if (!url) {
      state.runError = 'URL inválida para execução.';
      notify();
      return;
    }

    const useProxy = shouldUseProxy(url);
    state.isRunning = true;
    state.runError = null;
    state.usedProxy = useProxy;
    notify();

    const { sanitized: headers, stripped } = prepareExecutionHeaders(request.headers || {}, { skipBlocklist: useProxy });
    const body =
      request.bodyObject !== null && request.bodyObject !== undefined
        ? JSON.stringify(request.bodyObject)
        : request.bodyString;

    let fetchUrl = url;
    if (useProxy) {
      fetchUrl = buildProxyUrl(url);
    }

    const options = {
      method: request.method || 'GET',
      headers,
      body: shouldSendBody(request.method, body) ? body : undefined,
      credentials: 'same-origin'
    };

    const start = performance.now();

    try {
      const response = await fetch(fetchUrl, options);
      const duration = Math.round(performance.now() - start);
      const contentType = response.headers.get('content-type') || '';
      const headerObj = {};

      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      let bodyText = '';
      let bodyJson = null;
      let bodyError = null;

      try {
        bodyText = await response.text();
        if (isLikelyJson(contentType, bodyText)) {
          bodyJson = JSON.parse(bodyText);
        }
      } catch (error) {
        bodyError = error.message;
      }

      state.response = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: duration,
        headers: headerObj,
        bodyText,
        bodyJson,
        bodyError,
        contentType
      };

      state.runError = null;
    } catch (error) {
      state.runError = useProxy
        ? `Falha ao executar via proxy local: ${error.message}. Verifique se o dev-server está ativo (bash public/start.sh).`
        : error.message;
      state.response = null;
    } finally {
      state.isRunning = false;
      state.executionAdjustments = useProxy ? [] : stripped;
      state.parsedRequest.suggestions = generateSuggestions(state.parsedRequest, state.response);
      notify();
    }
  }

  /**
   * Add or update step in YAML state using parsed request
   * @param {Object} options
   * @param {'new'|number} options.target - 'new' to add, or index to update
   * @param {string} options.stepName
   * @param {string} options.stepId
   */
  function applyStep(options = {}) {
    if (!state.parsedRequest) {
      FileManager.showToast('Importe um cURL válido antes de criar o step.', 'error');
      return;
    }

    const target = options.target ?? 'new';
    const stepName = (options.stepName || '').trim();
    const stepId = (options.stepId || '').trim();

    const payload = buildStepPayload(stepName, stepId);

    try {
      if (target === 'new') {
        YamlState.addStep(payload);
        const steps = YamlState.getState().steps || [];
        state.lastStepIndex = steps.length - 1;
        FileManager.showToast('Step criado a partir do cURL.', 'success');
      } else {
        const index = parseInt(target, 10);
        if (Number.isNaN(index)) {
          FileManager.showToast('Índice de step inválido.', 'error');
          return;
        }
        if (!YamlState.getStep(index)) {
          FileManager.showToast('Step selecionado não existe.', 'error');
          return;
        }
        YamlState.updateStep(index, payload);
        state.lastStepIndex = index;
        FileManager.showToast(`Step #${index + 1} atualizado.`, 'success');
      }

      notify();
    } catch (error) {
      console.error('Erro ao aplicar step a partir do cURL:', error);
      FileManager.showToast(`Erro ao aplicar step: ${error.message}`, 'error');
    }
  }

  /**
   * Add capture entry to the last applied step (or selected index)
   * @param {string} path
   * @param {number|null} targetIndex
   * @param {string} variableName
   */
  function addCapture(path, targetIndex = null, variableName = '') {
    const index = determineStepIndex(targetIndex);

    if (index === null) {
      FileManager.showToast('Crie ou selecione um step antes de adicionar capturas.', 'info');
      return;
    }

    const name = (variableName || '').trim();

    if (!name) {
      FileManager.showToast('Informe um nome de variável para captura.', 'error');
      return;
    }

    const step = YamlState.getStep(index);
    if (!step) {
      FileManager.showToast('Step alvo não encontrado.', 'error');
      return;
    }

    const capture = { ...(step.capture || {}) };
    capture[name] = path;

    YamlState.updateStep(index, { capture });
    state.lastStepIndex = index;
    FileManager.showToast(`Captura "${name}" adicionada ao Step #${index + 1}.`, 'success');
    notify();
  }

  /**
   * Add assertion entry to the last applied step (or selected index)
   * @param {string} path
   * @param {{operator: string, expected: any}} config
   * @param {number|null} targetIndex
   */
  function addAssertion(path, config = {}, targetIndex = null) {
    const operator = (config.operator || '').trim();
    const expectedRaw = config.expected;

    if (!operator) {
      FileManager.showToast('Selecione um operador para o assert.', 'error');
      return;
    }

    const index = determineStepIndex(targetIndex);

    if (index === null) {
      FileManager.showToast('Crie ou selecione um step antes de adicionar asserts.', 'info');
      return;
    }

    const step = YamlState.getStep(index);
    if (!step) {
      FileManager.showToast('Step alvo não encontrado.', 'error');
      return;
    }

    const normalization = normalizeAssertionExpected(operator, expectedRaw, path);
    if (normalization.error) {
      FileManager.showToast(normalization.error, 'error');
      return;
    }
    const normalizedExpected = normalization.value;

    const clonedAssert = cloneAssert(step.assert);

    if (path === 'status') {
      if (operator !== 'equals') {
        FileManager.showToast('Para status code utilize o operador Equals.', 'info');
        return;
      }
      const numericStatus = Number(normalizedExpected);
      if (Number.isNaN(numericStatus)) {
        FileManager.showToast('Status code inválido para o assert.', 'error');
        return;
      }
      clonedAssert.status_code = numericStatus;
    } else if (path.startsWith('headers.')) {
      const headerKey = normalizeHeaderKey(path);
      if (!headerKey) {
        FileManager.showToast('Header inválido para assert.', 'error');
        return;
      }
      clonedAssert.headers = clonedAssert.headers || {};
      clonedAssert.headers[headerKey] = buildAssertionExpression(operator, normalizedExpected);
    } else if (path.startsWith('body.')) {
      const bodyPath = path.slice(5);
      if (!bodyPath) {
        FileManager.showToast('Caminho do body inválido para assert.', 'error');
        return;
      }
      clonedAssert.body = clonedAssert.body || {};
      clonedAssert.body[bodyPath] = buildAssertionExpression(operator, normalizedExpected);
    } else {
      FileManager.showToast('Ainda não suportamos asserts automáticos para este tipo de sugestão.', 'info');
      return;
    }

    YamlState.updateStep(index, { ...step, assert: clonedAssert });
    state.lastStepIndex = index;
    FileManager.showToast(`Assert adicionado ao Step #${index + 1}.`, 'success');
    notify();
  }

  /**
   * Update cached form inputs without triggering re-render
   * @param {Object} updates
   */
  function updateFormInputs(updates = {}) {
    state.formInputs = {
      ...state.formInputs,
      ...updates
    };
  }

  /**
   * Determine step index based on explicit target or lastStepIndex
   * @param {number|null} explicitIndex
   * @returns {number|null}
   */
  function determineStepIndex(explicitIndex) {
    if (typeof explicitIndex === 'number' && explicitIndex >= 0) {
      return explicitIndex;
    }

    if (typeof state.lastStepIndex === 'number' && state.lastStepIndex >= 0) {
      return state.lastStepIndex;
    }

    return null;
  }

  /**
   * Build payload for step creation/update
   */
  function buildStepPayload(stepName, stepId) {
    const request = state.parsedRequest;

    const cleanedHeaders = filterStepHeaders(request.headers || {});
    const params = Object.keys(request.queryParams || {}).length > 0 ? request.queryParams : undefined;
    const hasBody = request.bodyObject !== null && request.bodyObject !== undefined
      ? true
      : Boolean(request.bodyString && request.bodyString.trim() !== '');

    const bodyPayload =
      request.bodyObject !== null && request.bodyObject !== undefined
        ? request.bodyObject
        : hasBody
          ? request.bodyString
          : undefined;

    const payload = {
      name: stepName || request.defaultStepName,
      step_id: stepId || undefined,
      request: {
        method: request.method || 'GET',
        url: request.stepUrl,
        headers: Object.keys(cleanedHeaders).length > 0 ? cleanedHeaders : undefined,
        params,
        body: bodyPayload
      }
    };

    if (!payload.request.headers) {
      delete payload.request.headers;
    }
    if (!payload.request.params) {
      delete payload.request.params;
    }
    if (!payload.request.body) {
      delete payload.request.body;
    }

    return payload;
  }

  const NUMERIC_ASSERT_OPERATORS = new Set([
    'length',
    'greater_than',
    'less_than',
    'greater_than_or_equal',
    'less_than_or_equal'
  ]);

  function cloneAssert(assert) {
    if (!assert) return {};
    try {
      return JSON.parse(JSON.stringify(assert));
    } catch {
      return { ...assert };
    }
  }

  function normalizeAssertionExpected(operator, expected, path) {
    if (operator === 'exists') {
      if (expected === undefined) {
        return { value: true };
      }
      return { value: Boolean(expected) };
    }

    if (operator === 'type') {
      if (expected === undefined || expected === null) {
        return { error: 'Informe o tipo esperado (ex: string, number, object).' };
      }
      return { value: String(expected) };
    }

    if (path === 'status' || NUMERIC_ASSERT_OPERATORS.has(operator)) {
      const numeric = Number(expected);
      if (Number.isNaN(numeric)) {
        return { error: 'Valor numérico inválido para o assert selecionado.' };
      }
      return { value: numeric };
    }

    if (expected === undefined) {
      return { error: 'Informe um valor esperado para o assert.' };
    }

    return { value: expected };
  }

  function normalizeHeaderKey(path) {
    let key = path.replace(/^headers\./, '');
    if (!key) return null;
    if (key.startsWith('["') && key.endsWith('"]')) {
      key = key.slice(2, -2);
    } else if (key.startsWith('"') && key.endsWith('"')) {
      key = key.slice(1, -1);
    }
    return key.replace(/\\"/g, '"');
  }

  function buildAssertionExpression(operator, expected) {
    return { [operator]: expected };
  }

  /**
   * Normalizes command by collapsing multiline continuations
   */
  function normalizeCommand(command) {
    return command
      .replace(/\\\s*\n/g, ' ')
      .replace(/\r\n/g, '\n')
      .trim();
  }

  /**
   * Tokenize command respecting quotes
   */
  function tokenize(command) {
    const tokens = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escapeNext = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\' && !inSingle) {
        escapeNext = true;
        continue;
      }

      if (char === '\'' && !inDouble) {
        inSingle = !inSingle;
        continue;
      }

      if (char === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }

      if (!inSingle && !inDouble && /\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens.map(t => t.trim()).filter(Boolean);
  }

  /**
   * Interpret tokens into structured request data
   */
  function interpretTokens(tokens) {
    let method = null;
    let url = null;
    const headers = {};
    const queryParams = {};
    const warnings = [];
    const unsupported = [];
    const bodyParts = [];
    let authToken = null;

    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];
      if (!token) continue;

      const lower = token.toLowerCase();

      if (METHOD_FLAGS.has(lower)) {
        method = (tokens[i + 1] || '').toUpperCase();
        i += 1;
        continue;
      }

      if (lower.startsWith('-x') && lower.length > 2) {
        method = lower.slice(2).toUpperCase();
        continue;
      }

      if (lower.startsWith('--request=')) {
        method = lower.split('=')[1].toUpperCase();
        continue;
      }

      if (HEADER_FLAGS.has(lower)) {
        const headerValue = stripQuotes(tokens[i + 1] || '');
        const parsedHeader = parseHeader(headerValue);
        if (parsedHeader) {
          headers[parsedHeader.key] = parsedHeader.value;
        } else {
          warnings.push(`Cabeçalho inválido: ${headerValue}`);
        }
        i += 1;
        continue;
      }

      if (lower === '-b' || lower === '--cookie') {
        const cookieValue = stripQuotes(tokens[i + 1] || '');
        if (cookieValue) {
          headers.Cookie = mergeCookie(headers.Cookie, cookieValue);
        }
        i += 1;
        continue;
      }

      if (lower.startsWith('--cookie=')) {
        const cookieValue = stripQuotes(token.substring(9));
        if (cookieValue) {
          headers.Cookie = mergeCookie(headers.Cookie, cookieValue);
        }
        continue;
      }

      if (lower.startsWith('-h') && lower.length > 2) {
        const headerValue = stripQuotes(token.slice(2));
        const parsedHeader = parseHeader(headerValue);
        if (parsedHeader) {
          headers[parsedHeader.key] = parsedHeader.value;
        } else {
          warnings.push(`Cabeçalho inválido: ${headerValue}`);
        }
        continue;
      }

      if (lower.startsWith('--header=')) {
        const headerValue = stripQuotes(token.substring(9));
        const parsedHeader = parseHeader(headerValue);
        if (parsedHeader) {
          headers[parsedHeader.key] = parsedHeader.value;
        } else {
          warnings.push(`Cabeçalho inválido: ${headerValue}`);
        }
        continue;
      }

      if (DATA_FLAGS.has(lower)) {
        const value = tokens[i + 1] || '';
        bodyParts.push(stripQuotes(value));
        i += 1;
        continue;
      }

      if (lower.startsWith('--data=')) {
        bodyParts.push(stripQuotes(token.substring(7)));
        continue;
      }

      if (lower.startsWith('--data-raw=')) {
        bodyParts.push(stripQuotes(token.substring(11)));
        continue;
      }

      if (lower.startsWith('--data-urlencode=')) {
        bodyParts.push(stripQuotes(token.substring(18)));
        continue;
      }

      if (lower === '-u' || lower === '--user') {
        authToken = stripQuotes(tokens[i + 1] || '');
        i += 1;
        continue;
      }

      if (lower.startsWith('--user=')) {
        authToken = stripQuotes(token.substring(7));
        continue;
      }

      if (URL_FLAGS.has(lower)) {
        url = stripQuotes(tokens[i + 1] || '');
        i += 1;
        continue;
      }

      if (lower.startsWith('--url=')) {
        url = stripQuotes(token.substring(6));
        continue;
      }

      if (token.startsWith('http://') || token.startsWith('https://')) {
        url = stripQuotes(token);
        continue;
      }

      if (IGNORED_FLAGS.has(lower)) {
        continue;
      }

      if (token.startsWith('-')) {
        unsupported.push(token);
        continue;
      }

      if (!url) {
        url = stripQuotes(token);
        continue;
      }

    }

    if (authToken && !headers.Authorization) {
      const encoded = btoa(authToken);
      headers.Authorization = `Basic ${encoded}`;
    }

    if (!url) {
      return { error: 'URL não encontrada no comando cURL.', warnings };
    }

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (error) {
      return { error: 'URL inválida no comando cURL.', warnings };
    }

    urlObj.searchParams.forEach((value, key) => {
      if (queryParams[key]) {
        if (Array.isArray(queryParams[key])) {
          queryParams[key].push(value);
        } else {
          queryParams[key] = [queryParams[key], value];
        }
      } else {
        queryParams[key] = value;
      }
    });

    const bodyString = bodyParts.join('&').trim();
    let bodyObject = null;

    if (bodyString) {
      if (isJsonLike(bodyString)) {
        try {
          bodyObject = JSON.parse(bodyString);
        } catch {
          bodyObject = null;
        }
      }
    }

    const inferredMethod = method || (bodyString ? 'POST' : 'GET');
    const baseUrl = urlObj.origin;
    const pathWithQuery = urlObj.pathname + (urlObj.search || '');
    const path = urlObj.pathname || '/';

    const suiteState = YamlState.getState();
    const suiteBaseUrl = (suiteState.base_url || '').trim();
    const usesSuiteBase = suiteBaseUrl && baseUrl === suiteBaseUrl;

    const warningsWithUnsupported = unsupported.length > 0
      ? warnings.concat(`Opções não suportadas ignoradas: ${unsupported.join(', ')}`)
      : warnings;

    const absoluteUrl = `${urlObj.origin}${path}`;
    const absoluteUrlWithQuery = `${urlObj.origin}${pathWithQuery}`;

    const parsedRequest = {
      method: inferredMethod.toUpperCase(),
      absoluteUrl,
      absoluteUrlWithQuery,
      baseUrl,
      path,
      pathWithQuery,
      queryParams,
      headers,
      bodyString: bodyString || null,
      bodyObject,
      stepUrl: usesSuiteBase ? path : absoluteUrl,
      suggestedBaseUrl: suiteBaseUrl ? null : baseUrl,
      matchesSuiteBase: usesSuiteBase,
      hasQueryParams: Object.keys(queryParams).length > 0,
      defaultStepName: buildDefaultStepName(inferredMethod, path),
      warnings: warningsWithUnsupported
    };

    return parsedRequest;
  }

  /**
   * Generate default step name
   */
  function buildDefaultStepName(method, path) {
    const cleanPath = path === '/' ? '' : path;
    return `${(method || 'GET').toUpperCase()} ${cleanPath || '/'}`.trim();
  }

  /**
   * Parse header string "Key: Value"
   */
  function parseHeader(header) {
    const index = header.indexOf(':');
    if (index === -1) return null;
    const key = header.slice(0, index).trim();
    const value = header.slice(index + 1).trim();
    if (!key) return null;
    return { key, value };
  }

  /**
   * Remove surrounding quotes if present
   */
  function stripQuotes(value) {
    if (typeof value !== 'string') return value;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      return value.substring(1, value.length - 1);
    }
    return value;
  }

  /**
   * Merge cookie strings while avoiding duplicate separators
   */
  function mergeCookie(existingCookie, newCookie) {
    const base = (existingCookie || '').trim();
    const incoming = (newCookie || '').trim();
    if (!base) return incoming;
    if (!incoming) return base;
    if (base.endsWith(';')) {
      return `${base} ${incoming}`;
    }
    return `${base}; ${incoming}`;
  }

  /**
   * Determine if string looks like JSON
   */
  function isJsonLike(value) {
    return value.startsWith('{') || value.startsWith('[');
  }

  /**
   * Filter headers that should not be copied to step
   */
  function filterStepHeaders(headers) {
    const result = {};
    Object.entries(headers || {}).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (!DISALLOWED_STEP_HEADERS.has(lower)) {
        result[key] = value;
      }
    });
    return result;
  }

  /**
   * Build headers for fetch by removing restricted ones
   */
  /**
   * Prepare headers for browser execution, removing ones that break CORS/fetch
   */
  function prepareExecutionHeaders(headers, options = {}) {
    const sanitized = {};
    const stripped = [];
    const skipBlocklist = Boolean(options.skipBlocklist);

    Object.entries(headers || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      const lower = key.toLowerCase();
      const inDisallowed = DISALLOWED_STEP_HEADERS.has(lower);
      const inBlocklist =
        !skipBlocklist &&
        (EXECUTION_HEADER_BLOCKLIST.has(lower) ||
          lower.startsWith('sec-fetch-') ||
          lower.startsWith('sec-ch-'));

      if (inDisallowed || inBlocklist) {
        stripped.push(key);
        return;
      }

      const normalizedValue = Array.isArray(value) ? value.join(', ') : String(value);
      sanitized[key] = normalizedValue;
    });

    return { sanitized, stripped };
  }

  /**
   * Decide if proxy should be used for a given URL
   */
  function shouldUseProxy(targetUrl) {
    if (typeof window === 'undefined') return false;

    try {
      const currentOrigin = window.location.origin;
      const config = window.CurlLabConfig || {};
      if (config.disableProxy === true) {
        return false;
      }

      const resolved = new URL(targetUrl, currentOrigin);
      if (resolved.origin === currentOrigin) {
        return false;
      }

      let allowlist = ['localhost', '127.0.0.1', '::1'];
      if (Array.isArray(config.proxyAllowlist) && config.proxyAllowlist.length > 0) {
        allowlist = config.proxyAllowlist;
      } else if (typeof config.proxyAllowlist === 'string' && config.proxyAllowlist.trim() !== '') {
        allowlist = config.proxyAllowlist.split(',').map(host => host.trim()).filter(Boolean);
      }

      if (!allowlist.includes(resolved.hostname)) {
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Proxy detection error:', error);
      return false;
    }
  }

  function buildProxyUrl(targetUrl) {
    return `/__proxy?url=${encodeURIComponent(targetUrl)}`;
  }

  /**
   * Determine if body should be sent
   */
  function shouldSendBody(method, body) {
    if (!body) return false;
    const upper = (method || '').toUpperCase();
    return !['GET', 'HEAD'].includes(upper);
  }

  /**
   * Determine if response should be parsed as JSON
   */
  function isLikelyJson(contentType, bodyText) {
    if (!bodyText) return false;
    if (contentType.includes('application/json')) return true;
    return isJsonLike(bodyText.trim());
  }

  /**
   * Generate JMESPath suggestion groups based on response
   */
  function generateSuggestions(parsedRequest, response) {
    if (!response) return [];

    const suggestions = [];

    suggestions.push({
      title: 'Metadados da Resposta',
      items: [
        { path: 'status', preview: response.status, type: 'number', value: response.status },
        { path: 'status_text', preview: response.statusText || '', type: 'string', value: response.statusText || '' },
        { path: 'response_time_ms', preview: response.durationMs, type: 'number', value: response.durationMs }
      ]
    });

    if (response.headers && Object.keys(response.headers).length > 0) {
      const headerItems = Object.entries(response.headers).map(([key, value]) => ({
        path: buildHeaderPath(key),
        preview: value,
        type: 'string',
        value
      }));

      suggestions.push({
        title: 'Headers (JMESPath)',
        items: headerItems
      });
    }

    if (response.bodyJson) {
      const bodyItems = [];
      traverseJson(response.bodyJson, ['body'], bodyItems, 0);
      suggestions.push({
        title: 'Body (JMESPath)',
        items: bodyItems.slice(0, 150)
      });
    }

    return suggestions;
  }

  /**
   * Build JMESPath for header key
   */
  function buildHeaderPath(key) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return `headers.${key}`;
    }
    return `headers."${key.replace(/"/g, '\\"')}"`;
  }

  /**
   * Traverse JSON object to create JMESPath suggestions
   */
  function traverseJson(value, segments, output, depth) {
    if (depth > 8) return;

    const path = joinSegments(segments);
    const type = detectType(value);

    if (segments.length > 0) {
      output.push({
        path,
        preview: createPreview(value),
        type,
        value
      });
    }

    if (Array.isArray(value) && value.length > 0) {
      const wildcardPath = joinSegments([...segments, '[*]']);
      output.push({
        path: wildcardPath,
        preview: `Array (${value.length})`,
        type: 'array',
        value
      });

      traverseJson(value[0], [...segments, '[0]'], output, depth + 1);
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, nested]) => {
        traverseJson(nested, [...segments, key], output, depth + 1);
      });
    }
  }

  /**
   * Join path segments respecting JMESPath syntax
   */
  function joinSegments(segments) {
    let result = '';
    segments.forEach(segment => {
      if (segment.startsWith('[')) {
        result += segment;
      } else if (!result) {
        result = segment;
      } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
        result += `.${segment}`;
      } else {
        result += `["${segment.replace(/"/g, '\\"')}"]`;
      }
    });
    return result;
  }

  /**
   * Detect value type
   */
  function detectType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * Create human friendly preview of value
   */
  function createPreview(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') {
      return value.length > 80 ? `${value.slice(0, 77)}...` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `Array (${value.length})`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return `Objeto {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`;
    }
    return typeof value;
  }

  // Public API
  return {
    getState,
    subscribe,
    clear,
    parseCommand,
    runParsedRequest,
    applyStep,
    addCapture,
    addAssertion,
    updateFormInputs
  };
})();

// Expose globally
window.CurlLab = CurlLab;
