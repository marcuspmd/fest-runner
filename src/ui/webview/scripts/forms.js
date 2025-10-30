/**
 * forms.js - Dynamic form rendering module
 *
 * Renders forms dynamically based on section and binds to state.
 */

const FormRenderer = (function() {
  'use strict';

  // ============================================
  // HELPER FUNCTIONS - Visual Editors
  // ============================================

  /**
   * Generate a unique ID for dynamic elements
   */
  function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Escape HTML special characters to avoid XSS in dynamic rendering
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Modal management helpers
   */
  let activeModalCleanup = null;

  function closeActiveModal() {
    if (typeof activeModalCleanup === 'function') {
      activeModalCleanup();
    }
  }

  function openModal(contentHtml, bindCallback) {
    const container = document.getElementById('modal-container');
    if (!container) return null;

    closeActiveModal();

    container.innerHTML = `<div class="modal">${contentHtml}</div>`;
    container.style.display = 'flex';

    const modalElement = container.querySelector('.modal');

    function cleanup() {
      container.innerHTML = '';
      container.style.display = 'none';
      document.removeEventListener('keydown', handleEsc);
      container.removeEventListener('click', handleOverlay);
      activeModalCleanup = null;
    }

    function handleEsc(event) {
      if (event.key === 'Escape') {
        cleanup();
      }
    }

    function handleOverlay(event) {
      if (event.target === container) {
        cleanup();
      }
    }

    document.addEventListener('keydown', handleEsc);
    container.addEventListener('click', handleOverlay);

    activeModalCleanup = cleanup;

    if (typeof bindCallback === 'function') {
      bindCallback({ modalElement, close: cleanup });
    }

    return { modalElement, close: cleanup };
  }

  function suggestVariableName(path) {
    if (!path) return 'captura';

    let cleaned = path.replace(/^body\./, '')
      .replace(/^headers\./, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/["']/g, '');

    const segments = cleaned.split('.').filter(Boolean);
    let base = segments.length > 0 ? segments[segments.length - 1] : cleaned || 'captura';

    base = base.replace(/[^A-Za-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!base) base = 'captura';
    if (/^\d/.test(base)) {
      base = `var_${base}`;
    }

    return base.toLowerCase();
  }

  function formatExpectedForInput(value) {
    if (value === undefined) return '';
    if (value === null) return 'null';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  }

  function showCaptureNameModal(defaultName, onConfirm) {
    const inputId = generateId();
    const modalContent = `
      <div class="modal-header">
        <h3 class="modal-title">Definir nome da captura</h3>
        <button type="button" class="modal-close" aria-label="Fechar">×</button>
      </div>
      <div class="modal-body">
        <p class="form-hint">
          Informe o nome da variável que receberá o valor capturado.
        </p>
        <div class="form-group">
          <label class="form-label" for="${inputId}">Nome da variável</label>
          <input
            type="text"
            id="${inputId}"
            class="form-control"
            value="${escapeHtml(defaultName || '')}"
            placeholder="ex: auth_token"
          >
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary modal-confirm">Adicionar captura</button>
      </div>
    `;

    openModal(modalContent, ({ modalElement, close }) => {
      const input = modalElement.querySelector(`#${inputId}`);
      const confirmBtn = modalElement.querySelector('.modal-confirm');
      const cancelBtn = modalElement.querySelector('.modal-cancel');
      const closeBtn = modalElement.querySelector('.modal-close');

      const submit = () => {
        const value = input.value.trim();
        if (!value) {
          input.classList.add('is-invalid');
          input.focus();
          FileManager.showToast('Informe um nome para a variável de captura.', 'error');
          return;
        }
        close();
        if (typeof onConfirm === 'function') {
          onConfirm(value);
        }
      };

      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });

      confirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        submit();
      });

      cancelBtn.addEventListener('click', (event) => {
        event.preventDefault();
        close();
      });

      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        close();
      });

      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    });
  }

  function inferAssertionDefaults(path, type, value) {
    if (path === 'status') {
      return {
        operator: 'equals',
        expected: typeof value === 'number' ? value : '',
        placeholder: 'Ex: 200'
      };
    }

    if (type === 'array') {
      return {
        operator: 'length',
        expected: Array.isArray(value) ? value.length : '',
        placeholder: 'Tamanho esperado (número)'
      };
    }

    if (type === 'object') {
      return {
        operator: 'type',
        expected: 'object',
        placeholder: 'Ex: object'
      };
    }

    if (type === 'null') {
      return {
        operator: 'type',
        expected: 'null',
        placeholder: 'Ex: null'
      };
    }

    if (type === 'boolean') {
      return {
        operator: 'equals',
        expected: value,
        placeholder: 'Ex: true'
      };
    }

    if (type === 'number') {
      return {
        operator: 'equals',
        expected: value,
        placeholder: 'Ex: 123'
      };
    }

    return {
      operator: 'equals',
      expected: value !== undefined ? value : '',
      placeholder: 'Valor esperado'
    };
  }

  const NUMERIC_OPERATORS = new Set([
    'length',
    'greater_than',
    'less_than',
    'greater_than_or_equal',
    'less_than_or_equal'
  ]);

  function parseExpectedInput(operator, rawValue, options = {}) {
    const trimmed = (rawValue || '').trim();
    const actualValue = options.actualValue;
    const valueType = options.type;

    if (operator === 'exists') {
      if (!trimmed) {
        return { value: true };
      }
      const normalized = trimmed.toLowerCase();
      if (['false', '0', 'no', 'não', 'nao', 'off'].includes(normalized)) {
        return { value: false };
      }
      return { value: true };
    }

    if (operator === 'type') {
      const selected = trimmed || (valueType === 'null' ? 'null' : valueType || 'string');
      return { value: selected };
    }

    if (NUMERIC_OPERATORS.has(operator)) {
      let source = trimmed;
      if (!source) {
        if (typeof actualValue === 'number') {
          source = String(actualValue);
        } else if (Array.isArray(actualValue)) {
          source = String(actualValue.length);
        }
      }
      const numeric = Number(source);
      if (Number.isNaN(numeric)) {
        return { error: 'Informe um número válido para o operador selecionado.' };
      }
      return { value: numeric };
    }

    if (!trimmed) {
      if (actualValue !== undefined) {
        return { value: actualValue };
      }
      return { error: 'Informe um valor esperado ou execute a request para obter uma sugestão.' };
    }

    try {
      return { value: JSON.parse(trimmed) };
    } catch {
      return { value: trimmed };
    }
  }

  function showAssertionModal({ path, type, value, preview, onConfirm }) {
    const defaults = inferAssertionDefaults(path, type, value);
    const selectId = generateId();
    const inputId = generateId();
    const errorId = generateId();

    const modalContent = `
      <div class="modal-header">
        <h3 class="modal-title">Criar assert</h3>
        <button type="button" class="modal-close" aria-label="Fechar">×</button>
      </div>
      <div class="modal-body">
        <p class="form-hint">JMESPath: <code>${escapeHtml(path)}</code></p>
        ${preview ? `<div class="alert alert-secondary">Valor detectado: ${escapeHtml(preview)}</div>` : ''}
        <div class="form-group">
          <label class="form-label" for="${selectId}">Operador</label>
          <select class="form-control" id="${selectId}">
            <option value="equals">Equals (=)</option>
            <option value="contains">Contains</option>
            <option value="exists">Exists</option>
            <option value="length">Length</option>
            <option value="type">Type</option>
            <option value="regex">Regex</option>
            <option value="greater_than">Greater Than</option>
            <option value="less_than">Less Than</option>
          </select>
        </div>
        <div class="form-group" data-expected-group>
          <label class="form-label" for="${inputId}">Valor esperado</label>
          <input
            type="text"
            class="form-control"
            id="${inputId}"
            value="${escapeHtml(formatExpectedForInput(defaults.expected))}"
            placeholder="${escapeHtml(defaults.placeholder || 'Valor esperado')}"
          >
          <small class="form-hint">Use JSON para objetos ou deixe vazio para usar o valor detectado.</small>
        </div>
        <p class="form-hint" id="${errorId}" style="display: none; color: var(--color-danger); margin-top: var(--space-sm);"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary modal-confirm">Adicionar assert</button>
      </div>
    `;

    openModal(modalContent, ({ modalElement, close }) => {
      const operatorSelect = modalElement.querySelector(`#${selectId}`);
      const expectedGroup = modalElement.querySelector('[data-expected-group]');
      const expectedInput = modalElement.querySelector(`#${inputId}`);
      const errorElement = modalElement.querySelector(`#${errorId}`);
      const confirmBtn = modalElement.querySelector('.modal-confirm');
      const cancelBtn = modalElement.querySelector('.modal-cancel');
      const closeBtn = modalElement.querySelector('.modal-close');

      if (defaults.operator) {
        operatorSelect.value = defaults.operator;
      }

      let expectedDirty = false;

      function toggleExpectedVisibility() {
        const operator = operatorSelect.value;
        if (operator === 'exists') {
          expectedGroup.style.display = 'none';
        } else {
          expectedGroup.style.display = 'block';
          if (!expectedDirty) {
            if (operator === 'length' && Array.isArray(value)) {
              expectedInput.value = String(value.length);
            } else if (operator === 'type') {
              expectedInput.value = value === null ? 'null' : (type || 'string');
            } else if (expectedInput.value === '' && value !== undefined) {
              expectedInput.value = formatExpectedForInput(value);
            }
          }
        }
      }

      operatorSelect.addEventListener('change', () => {
        errorElement.style.display = 'none';
        toggleExpectedVisibility();
      });

      expectedInput.addEventListener('input', () => {
        expectedDirty = true;
        errorElement.style.display = 'none';
      });

      const submit = () => {
        const operator = operatorSelect.value;
        const rawValue = expectedGroup.style.display === 'none' ? '' : expectedInput.value;
        const { value: expectedValue, error } = parseExpectedInput(operator, rawValue, { type, actualValue: value });
        if (error) {
          errorElement.textContent = error;
          errorElement.style.display = 'block';
          if (expectedGroup.style.display !== 'none') {
            expectedInput.focus();
          }
          return;
        }
        close();
        if (typeof onConfirm === 'function') {
          onConfirm({ operator, expected: expectedValue });
        }
      };

      confirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        submit();
      });

      cancelBtn.addEventListener('click', (event) => {
        event.preventDefault();
        close();
      });

      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        close();
      });

      toggleExpectedVisibility();

      setTimeout(() => {
        if (expectedGroup.style.display !== 'none') {
          expectedInput.focus();
          expectedInput.select();
        } else {
          operatorSelect.focus();
        }
      }, 50);
    });
  }

  /**
   * Render toggle button for Raw/Fields mode
   */
  function renderToggleButton(id, currentMode = 'raw') {
    return `
      <div class="btn-group mb-sm" role="group">
        <button type="button" class="btn btn-sm ${currentMode === 'raw' ? 'btn-primary' : 'btn-secondary'}" data-toggle="${id}" data-mode="raw">
          📝 Raw JSON
        </button>
        <button type="button" class="btn btn-sm ${currentMode === 'fields' ? 'btn-primary' : 'btn-secondary'}" data-toggle="${id}" data-mode="fields">
          📋 Fields
        </button>
      </div>
    `;
  }

  /**
   * Render key-value editor (for headers, params, capture)
   */
  function renderKeyValueEditor(id, items = {}, placeholder = { key: 'key', value: 'value' }) {
    const entries = Object.entries(items);
    let html = `<div class="key-value-editor" data-editor="${id}">`;

    if (entries.length === 0) {
      entries.push(['', '']);
    }

    entries.forEach(([key, value], index) => {
      const rowId = generateId();
      html += `
        <div class="key-value-row" data-row="${rowId}">
          <input
            type="text"
            class="form-control form-control-sm kv-key"
            placeholder="${placeholder.key}"
            value="${key}"
            style="width: 40%; display: inline-block;"
          >
          <span style="margin: 0 8px;">:</span>
          <input
            type="text"
            class="form-control form-control-sm kv-value"
            placeholder="${placeholder.value}"
            value="${typeof value === 'object' ? JSON.stringify(value) : value}"
            style="width: 45%; display: inline-block;"
          >
          <button type="button" class="btn btn-sm btn-danger kv-remove" style="margin-left: 8px;">🗑️</button>
        </div>
      `;
    });

    html += `
      <button type="button" class="btn btn-sm btn-secondary kv-add" data-editor="${id}">
        ➕ Adicionar
      </button>
    </div>`;

    return html;
  }

  /**
   * Render assertion builder (for body assertions)
   */
  function renderAssertionBuilder(id, assertions = {}) {
    let html = `<div class="assertion-builder" data-builder="${id}">`;

    const entries = Object.entries(assertions);
    if (entries.length === 0) {
      entries.push(['', { exists: true }]);
    }

    entries.forEach(([path, checks], index) => {
      const rowId = generateId();
      const firstCheck = Object.keys(checks)[0] || 'exists';
      const firstValue = checks[firstCheck];

      html += `
        <div class="assertion-row card mb-sm" data-row="${rowId}">
          <div class="card-body" style="padding: 12px;">
            <div class="form-group mb-sm">
              <label class="form-label-sm">Campo (path)</label>
              <input
                type="text"
                class="form-control form-control-sm assert-path"
                placeholder="user.email"
                value="${path}"
              >
            </div>
            <div class="form-group mb-sm">
              <label class="form-label-sm">Operador</label>
              <select class="form-control form-control-sm assert-operator">
                <option value="exists" ${firstCheck === 'exists' ? 'selected' : ''}>Exists</option>
                <option value="equals" ${firstCheck === 'equals' ? 'selected' : ''}>Equals</option>
                <option value="contains" ${firstCheck === 'contains' ? 'selected' : ''}>Contains</option>
                <option value="regex" ${firstCheck === 'regex' ? 'selected' : ''}>Regex</option>
                <option value="type" ${firstCheck === 'type' ? 'selected' : ''}>Type</option>
                <option value="length" ${firstCheck === 'length' ? 'selected' : ''}>Length</option>
                <option value="greater_than" ${firstCheck === 'greater_than' ? 'selected' : ''}>Greater Than</option>
                <option value="less_than" ${firstCheck === 'less_than' ? 'selected' : ''}>Less Than</option>
              </select>
            </div>
            <div class="form-group mb-sm">
              <label class="form-label-sm">Valor</label>
              <input
                type="text"
                class="form-control form-control-sm assert-value"
                placeholder="valor esperado"
                value="${typeof firstValue === 'boolean' ? firstValue : (firstValue || '')}"
              >
            </div>
            <button type="button" class="btn btn-sm btn-danger assert-remove">🗑️ Remover</button>
          </div>
        </div>
      `;
    });

    html += `
      <button type="button" class="btn btn-sm btn-secondary assert-add" data-builder="${id}">
        ➕ Adicionar Assertion
      </button>
    </div>`;

    return html;
  }

  /**
   * Parse key-value editor to object
   */
  function parseKeyValueEditor(editorId) {
    const editor = document.querySelector(`[data-editor="${editorId}"]`);
    if (!editor) return {};

    const obj = {};
    editor.querySelectorAll('.key-value-row').forEach(row => {
      const key = row.querySelector('.kv-key').value.trim();
      const value = row.querySelector('.kv-value').value.trim();
      if (key) {
        // Try to parse as JSON, fallback to string
        try {
          obj[key] = JSON.parse(value);
        } catch {
          obj[key] = value;
        }
      }
    });
    return obj;
  }

  /**
   * Parse assertion builder to object
   */
  function parseAssertionBuilder(builderId) {
    const builder = document.querySelector(`[data-builder="${builderId}"]`);
    if (!builder) return {};

    const assertions = {};
    builder.querySelectorAll('.assertion-row').forEach(row => {
      const path = row.querySelector('.assert-path').value.trim();
      const operator = row.querySelector('.assert-operator').value;
      const valueInput = row.querySelector('.assert-value').value.trim();

      if (path) {
        let value = valueInput;
        // Convert types
        if (operator === 'exists') {
          value = valueInput === 'false' ? false : true;
        } else if (operator === 'length' || operator === 'greater_than' || operator === 'less_than') {
          value = parseInt(valueInput) || 0;
        }

        assertions[path] = { [operator]: value };
      }
    });
    return assertions;
  }

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  /**
   * Render form for Suite Configuration section
   */
  function renderSuiteConfigForm() {
    const state = YamlState.getState();

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Configuração da Suite</h2>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label form-label-required" for="node_id">Node ID</label>
            <input
              type="text"
              id="node_id"
              class="form-control"
              value="${state.node_id || ''}"
              placeholder="my-test-suite"
              required
            >
            <small class="form-hint">Identificador único usando kebab-case (ex: auth-login-test)</small>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required" for="suite_name">Nome da Suite</label>
            <input
              type="text"
              id="suite_name"
              class="form-control"
              value="${state.suite_name || ''}"
              placeholder="Authentication Tests"
              required
            >
            <small class="form-hint">Nome legível para humanos</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="description">Descrição</label>
            <textarea
              id="description"
              class="form-control"
              rows="3"
              placeholder="Descrição detalhada dos testes..."
            >${state.description || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="base_url">Base URL</label>
            <input
              type="url"
              id="base_url"
              class="form-control"
              value="${state.base_url || ''}"
              placeholder="https://api.example.com"
            >
            <small class="form-hint">URL base para requisições relativas</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="execution_mode">Modo de Execução</label>
            <select id="execution_mode" class="form-control">
              <option value="sequential" ${state.execution_mode === 'sequential' ? 'selected' : ''}>Sequential</option>
              <option value="parallel" ${state.execution_mode === 'parallel' ? 'selected' : ''}>Parallel</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render form for Steps List section
   */
  function renderStepsListForm() {
    const state = YamlState.getState();
    const steps = state.steps || [];

    let html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Steps de Teste</h2>
        </div>
        <div class="card-body">
          <button id="btn-add-step" class="btn btn-primary mb-lg">
            <span class="btn-icon">➕</span>
            <span class="btn-text">Adicionar Step</span>
          </button>
    `;

    if (steps.length === 0) {
      html += '<p class="text-center">Nenhum step adicionado ainda.</p>';
    } else {
      html += '<div class="steps-list">';
      steps.forEach((step, index) => {
        html += `
          <div class="card mb-md" data-step-index="${index}">
            <div class="card-body">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4>${index + 1}. ${step.name || 'Unnamed Step'}</h4>
                  ${step.step_id ? `<small class="text-muted">ID: ${step.step_id}</small>` : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-sm btn-secondary btn-edit-step" data-index="${index}">✏️ Editar</button>
                  <button class="btn btn-sm btn-danger btn-delete-step" data-index="${index}">🗑️ Remover</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render form for adding/editing a step
   */
  function renderStepForm(stepIndex = null) {
    const step = stepIndex !== null ? YamlState.getStep(stepIndex) : {
      name: '',
      step_id: '',
      stepType: 'http-request'
    };

    // Detectar tipo de step existente
    let stepType = 'http-request';
    if (step.input) stepType = 'input';
    else if (step.iterate) stepType = 'loop';
    else if (step.scenarios) stepType = 'scenario';
    else if (step.call) stepType = 'call';
    else if (step.request) stepType = 'http-request';

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">${stepIndex !== null ? 'Editar' : 'Adicionar'} Step</h2>
        </div>
        <div class="card-body">
          <input type="hidden" id="step_index" value="${stepIndex !== null ? stepIndex : ''}">

          <div class="form-group">
            <label class="form-label form-label-required" for="step_name">Nome do Step</label>
            <input
              type="text"
              id="step_name"
              class="form-control"
              value="${step.name || ''}"
              placeholder="Login com credenciais"
              required
            >
          </div>

          <div class="form-group">
            <label class="form-label" for="step_step_id">Step ID (opcional)</label>
            <input
              type="text"
              id="step_step_id"
              class="form-control"
              value="${step.step_id || ''}"
              placeholder="login-step"
            >
            <small class="form-hint">ID único para referência em outros steps</small>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required" for="step_type">Tipo de Step</label>
            <select id="step_type" class="form-control">
              <option value="http-request" ${stepType === 'http-request' ? 'selected' : ''}>🌐 HTTP Request</option>
              <option value="input" ${stepType === 'input' ? 'selected' : ''}>⌨️ Input Interativo</option>
              <option value="loop" ${stepType === 'loop' ? 'selected' : ''}>🔄 Loop (Iteration)</option>
              <option value="scenario" ${stepType === 'scenario' ? 'selected' : ''}>🔀 Scenario Condicional</option>
              <option value="call" ${stepType === 'call' ? 'selected' : ''}>📞 Call (Cross-Suite)</option>
            </select>
          </div>

          <div id="step-type-forms">
            ${renderStepTypeForm(stepType, step)}
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-primary" id="btn-save-step">💾 Salvar Step</button>
            <button type="button" class="btn btn-secondary" id="btn-cancel-step">❌ Cancelar</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render form specific to step type
   */
  function renderStepTypeForm(stepType, step) {
    switch (stepType) {
      case 'http-request':
        return renderHttpRequestForm(step);
      case 'input':
        return renderInputForm(step);
      case 'loop':
        return renderLoopForm(step);
      case 'scenario':
        return renderScenarioForm(step);
      case 'call':
        return renderCallForm(step);
      default:
        return '';
    }
  }

  /**
   * Render HTTP Request form
   */
  function renderHttpRequestForm(step) {
    const request = step.request || { method: 'GET', url: '', headers: {}, params: {}, body: null };

    return `
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">🌐 Requisição HTTP</h3>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label form-label-required" for="step_method">Método HTTP</label>
            <select id="step_method" class="form-control">
              <option value="GET" ${request.method === 'GET' ? 'selected' : ''}>GET</option>
              <option value="POST" ${request.method === 'POST' ? 'selected' : ''}>POST</option>
              <option value="PUT" ${request.method === 'PUT' ? 'selected' : ''}>PUT</option>
              <option value="DELETE" ${request.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
              <option value="PATCH" ${request.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
              <option value="HEAD" ${request.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
              <option value="OPTIONS" ${request.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required" for="step_url">URL</label>
            <input
              type="text"
              id="step_url"
              class="form-control"
              value="${request.url || ''}"
              placeholder="/api/auth/login"
              required
            >
            <small class="form-hint">Use / para relativo (base_url + url) ou URL completa</small>
          </div>

          <div class="form-group">
            <label class="form-label">Headers</label>
            ${renderToggleButton('headers', 'fields')}
            <div id="headers-raw" style="display: none;">
              <textarea
                id="step_headers_raw"
                class="form-control"
                rows="3"
                placeholder='{"Content-Type": "application/json"}'
              >${request.headers ? JSON.stringify(request.headers, null, 2) : ''}</textarea>
            </div>
            <div id="headers-fields">
              ${renderKeyValueEditor('headers', request.headers || {}, { key: 'Header name', value: 'value' })}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Query Params</label>
            ${renderToggleButton('params', 'fields')}
            <div id="params-raw" style="display: none;">
              <textarea
                id="step_params_raw"
                class="form-control"
                rows="3"
                placeholder='{"page": 1, "limit": 10}'
              >${request.params ? JSON.stringify(request.params, null, 2) : ''}</textarea>
            </div>
            <div id="params-fields">
              ${renderKeyValueEditor('params', request.params || {}, { key: 'param', value: 'value' })}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Body</label>
            ${renderToggleButton('body', 'raw')}
            <div id="body-raw">
              <textarea
                id="step_body_raw"
                class="form-control"
                rows="5"
                placeholder='{"username": "{{user}}", "password": "{{pass}}"}'
              >${request.body ? JSON.stringify(request.body, null, 2) : ''}</textarea>
            </div>
            <div id="body-fields" style="display: none;">
              ${renderKeyValueEditor('body', request.body || {}, { key: 'field', value: 'value' })}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="step_timeout">Timeout (ms)</label>
            <input
              type="number"
              id="step_timeout"
              class="form-control"
              value="${request.timeout || ''}"
              placeholder="30000"
            >
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">✅ Assertions</h3>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label" for="step_assert_status">Status Code Esperado</label>
            <input
              type="number"
              id="step_assert_status"
              class="form-control"
              value="${step.assert?.status_code || ''}"
              placeholder="200"
            >
          </div>

          <div class="form-group">
            <label class="form-label">Body Assertions</label>
            ${renderToggleButton('assertions', 'fields')}
            <div id="assertions-raw" style="display: none;">
              <textarea
                id="step_assert_body_raw"
                class="form-control"
                rows="4"
                placeholder='{"token": {"exists": true, "type": "string"}}'
              >${step.assert?.body ? JSON.stringify(step.assert.body, null, 2) : ''}</textarea>
              <small class="form-hint">Operadores: exists, type, equals, contains, regex, etc.</small>
            </div>
            <div id="assertions-fields">
              ${renderAssertionBuilder('assertions', step.assert?.body || {})}
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">🎣 Capture</h3>
        </div>
        <div class="panel-body">
          <div class="alert alert-info">
            Capture variáveis da resposta usando expressões JMESPath. Ex: <code>body.token</code> ou <code>body.user.id</code>
          </div>

          <div class="form-group">
            <label class="form-label">Capture</label>
            ${renderToggleButton('capture', 'fields')}
            <div id="capture-raw" style="display: none;">
              <textarea
                id="step_capture_raw"
                class="form-control"
                rows="4"
                placeholder='{"auth_token": "body.token", "user_id": "body.user.id"}'
              >${step.capture ? JSON.stringify(step.capture, null, 2) : ''}</textarea>
              <small class="form-hint">Formato: {"variavel": "expressao_jmespath"}</small>
            </div>
            <div id="capture-fields">
              ${renderKeyValueEditor('capture', step.capture || {}, { key: 'variable', value: 'JMESPath expression' })}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Input form (interactive input)
   */
  function renderInputForm(step) {
    const input = step.input || {};

    return `
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">⌨️ Input Interativo</h3>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label form-label-required" for="input_prompt">Prompt</label>
            <textarea
              id="input_prompt"
              class="form-control"
              rows="2"
              placeholder="Digite o email do usuário de teste:"
              required
            >${input.prompt || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required" for="input_variable">Nome da Variável</label>
            <input
              type="text"
              id="input_variable"
              class="form-control"
              value="${input.variable || ''}"
              placeholder="test_email"
              required
            >
            <small class="form-hint">Nome da variável onde o input será armazenado</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="input_type">Tipo de Input</label>
            <select id="input_type" class="form-control">
              <option value="text" ${input.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="select" ${input.type === 'select' ? 'selected' : ''}>Select</option>
              <option value="multiselect" ${input.type === 'multiselect' ? 'selected' : ''}>Multi-Select</option>
              <option value="password" ${input.type === 'password' ? 'selected' : ''}>Password</option>
              <option value="number" ${input.type === 'number' ? 'selected' : ''}>Number</option>
              <option value="email" ${input.type === 'email' ? 'selected' : ''}>Email</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="input_default">Valor Padrão</label>
            <input
              type="text"
              id="input_default"
              class="form-control"
              value="${input.default || ''}"
              placeholder="valor padrão"
            >
          </div>

          <div class="form-group">
            <label class="form-label" for="input_ci_default">Valor CI/CD</label>
            <input
              type="text"
              id="input_ci_default"
              class="form-control"
              value="${input.ci_default || ''}"
              placeholder="valor usado em CI"
            >
            <small class="form-hint">Valor usado quando rodando em CI/CD (não interativo)</small>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="input_required" ${input.required ? 'checked' : ''}>
              Campo Obrigatório
            </label>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Loop form (iteration)
   */
  function renderLoopForm(step) {
    const iterate = step.iterate || {};
    const isRange = !!iterate.range;
    const steps = iterate.steps || [];

    let html = `
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">🔄 Loop (Iteration)</h3>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label">Tipo de Iteração</label>
            <select id="loop_type" class="form-control">
              <option value="array" ${!isRange ? 'selected' : ''}>Iterar sobre Array</option>
              <option value="range" ${isRange ? 'selected' : ''}>Iterar sobre Range</option>
            </select>
          </div>

          <div id="loop-array-form" style="display: ${!isRange ? 'block' : 'none'}">
            <div class="form-group">
              <label class="form-label form-label-required" for="loop_over">Array (variável ou expressão)</label>
              <input
                type="text"
                id="loop_over"
                class="form-control"
                value="${iterate.over || ''}"
                placeholder="{{users}}"
              >
              <small class="form-hint">Ex: {{users}} ou {{response.data}}</small>
            </div>

            <div class="form-group">
              <label class="form-label form-label-required" for="loop_as">Nome do Item (variável)</label>
              <input
                type="text"
                id="loop_as"
                class="form-control"
                value="${iterate.as || ''}"
                placeholder="user"
              >
              <small class="form-hint">Nome da variável para cada item do array</small>
            </div>
          </div>

          <div id="loop-range-form" style="display: ${isRange ? 'block' : 'none'}">
            <div class="form-group">
              <label class="form-label form-label-required" for="loop_range">Range (formato: start..end)</label>
              <input
                type="text"
                id="loop_range"
                class="form-control"
                value="${iterate.range || ''}"
                placeholder="1..10"
              >
              <small class="form-hint">Ex: 1..10 ou 0..100</small>
            </div>

            <div class="form-group">
              <label class="form-label form-label-required" for="loop_range_as">Nome da Variável</label>
              <input
                type="text"
                id="loop_range_as"
                class="form-control"
                value="${iterate.as || ''}"
                placeholder="index"
              >
            </div>
          </div>

          <hr class="my-md">

          <h4 class="mb-sm">📋 Steps do Loop</h4>
          <p class="form-hint mb-md">Adicione os steps que serão executados em cada iteração:</p>

          <div id="loop-steps-list">`;

    if (steps.length === 0) {
      html += `
            <p class="text-muted text-center" style="padding: 20px; border: 2px dashed #ddd; border-radius: 8px;">
              Nenhum step adicionado. Clique em "➕ Adicionar Step" abaixo.
            </p>`;
    } else {
      steps.forEach((childStep, stepIndex) => {
        html += `
            <div class="loop-step-item card mb-sm" data-step-index="${stepIndex}">
              <div class="card-body" style="padding: 12px;">
                <div class="row">
                  <div class="col-md-5">
                    <label class="form-label form-label-required">Step Name</label>
                    <input
                      type="text"
                      class="form-control form-control-sm loop-step-name"
                      data-step="${stepIndex}"
                      value="${childStep.name || ''}"
                      placeholder="Step name"
                      required
                    >
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">Type</label>
                    <select class="form-control form-control-sm loop-step-type" data-step="${stepIndex}">
                      <option value="http" ${!childStep.request ? '' : 'selected'}>HTTP Request</option>
                      <option value="capture" ${childStep.capture && !childStep.request ? 'selected' : ''}>Capture Only</option>
                      <option value="assert" ${childStep.assert && !childStep.request ? 'selected' : ''}>Assert Only</option>
                    </select>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">Action</label>
                    <button type="button" class="btn btn-sm btn-danger btn-block loop-step-remove" data-step="${stepIndex}">
                      🗑️ Remover
                    </button>
                  </div>
                </div>

                <!-- HTTP Request mini config -->
                <div class="loop-step-http mt-sm" style="display: ${childStep.request ? 'block' : 'none'};" data-step="${stepIndex}">
                  <div class="row">
                    <div class="col-md-3">
                      <label class="form-label form-label-sm">Method</label>
                      <select class="form-control form-control-sm loop-step-method" data-step="${stepIndex}">
                        <option value="GET" ${childStep.request?.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${childStep.request?.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${childStep.request?.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${childStep.request?.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                        <option value="PATCH" ${childStep.request?.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                      </select>
                    </div>
                    <div class="col-md-9">
                      <label class="form-label form-label-sm">URL</label>
                      <input
                        type="text"
                        class="form-control form-control-sm loop-step-url"
                        data-step="${stepIndex}"
                        value="${childStep.request?.url || ''}"
                        placeholder="/api/endpoint"
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
      });
    }

    html += `
          </div>

          <button type="button" class="btn btn-sm btn-secondary" id="loop-add-step">
            ➕ Adicionar Step
          </button>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render Scenario form (conditional scenarios)
   */
  function renderScenarioForm(step) {
    const scenarios = step.scenarios || [{ condition: '', steps: [] }];

    let html = `
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">🔀 Scenarios Condicionais</h3>
        </div>
        <div class="panel-body">
          <p class="form-hint mb-md">
            Scenarios executam diferentes steps baseados em condições. Você pode ter múltiplos scenarios,
            cada um com sua própria condição e lista de steps.
          </p>

          <div id="scenarios-list">`;

    scenarios.forEach((scenario, index) => {
      const steps = scenario.steps || [];
      html += `
            <div class="scenario-card card mb-md" data-scenario-index="${index}">
              <div class="card-header">
                <strong>Scenario ${index + 1}</strong>
                <button type="button" class="btn btn-sm btn-danger float-right scenario-remove" data-index="${index}">
                  🗑️ Remover
                </button>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label form-label-required">Condição</label>
                  <input
                    type="text"
                    class="form-control scenario-condition"
                    data-index="${index}"
                    value="${scenario.condition || ''}"
                    placeholder="{{response.status}} == 200"
                    required
                  >
                  <small class="form-hint">Expressão booleana usando variáveis (ex: {{var}} == value)</small>
                </div>

                <div class="form-group">
                  <label class="form-label">Steps a executar</label>
                  <div class="scenario-steps-list" data-scenario-index="${index}">`;

      if (steps.length === 0) {
        html += `
                    <p class="text-muted text-center" style="padding: 20px; border: 2px dashed #ddd; border-radius: 8px;">
                      Nenhum step adicionado. Clique em "➕ Adicionar Step" abaixo.
                    </p>`;
      } else {
        steps.forEach((childStep, stepIndex) => {
          html += `
                    <div class="scenario-step-item card mb-sm" data-step-index="${stepIndex}">
                      <div class="card-body" style="padding: 12px;">
                        <div class="row">
                          <div class="col-md-5">
                            <label class="form-label form-label-required">Step Name</label>
                            <input
                              type="text"
                              class="form-control form-control-sm scenario-step-name"
                              data-scenario="${index}"
                              data-step="${stepIndex}"
                              value="${childStep.name || ''}"
                              placeholder="Step name"
                              required
                            >
                          </div>
                          <div class="col-md-3">
                            <label class="form-label">Type</label>
                            <select class="form-control form-control-sm scenario-step-type" data-scenario="${index}" data-step="${stepIndex}">
                              <option value="http" ${!childStep.request ? '' : 'selected'}>HTTP Request</option>
                              <option value="capture" ${childStep.capture && !childStep.request ? 'selected' : ''}>Capture Only</option>
                              <option value="assert" ${childStep.assert && !childStep.request ? 'selected' : ''}>Assert Only</option>
                            </select>
                          </div>
                          <div class="col-md-3">
                            <label class="form-label">Action</label>
                            <button type="button" class="btn btn-sm btn-danger btn-block scenario-step-remove" data-scenario="${index}" data-step="${stepIndex}">
                              🗑️ Remover
                            </button>
                          </div>
                        </div>

                        <!-- HTTP Request mini config (if type is http) -->
                        <div class="scenario-step-http mt-sm" style="display: ${childStep.request ? 'block' : 'none'};" data-scenario="${index}" data-step="${stepIndex}">
                          <div class="row">
                            <div class="col-md-3">
                              <label class="form-label form-label-sm">Method</label>
                              <select class="form-control form-control-sm scenario-step-method" data-scenario="${index}" data-step="${stepIndex}">
                                <option value="GET" ${childStep.request?.method === 'GET' ? 'selected' : ''}>GET</option>
                                <option value="POST" ${childStep.request?.method === 'POST' ? 'selected' : ''}>POST</option>
                                <option value="PUT" ${childStep.request?.method === 'PUT' ? 'selected' : ''}>PUT</option>
                                <option value="DELETE" ${childStep.request?.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                                <option value="PATCH" ${childStep.request?.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                              </select>
                            </div>
                            <div class="col-md-9">
                              <label class="form-label form-label-sm">URL</label>
                              <input
                                type="text"
                                class="form-control form-control-sm scenario-step-url"
                                data-scenario="${index}"
                                data-step="${stepIndex}"
                                value="${childStep.request?.url || ''}"
                                placeholder="/api/endpoint"
                              >
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>`;
        });
      }

      html += `
                  </div>
                  <button type="button" class="btn btn-sm btn-secondary scenario-add-step" data-scenario="${index}">
                    ➕ Adicionar Step
                  </button>
                </div>
              </div>
            </div>`;
    });

    html += `
          </div>

          <button type="button" class="btn btn-secondary" id="scenario-add">
            ➕ Adicionar Novo Scenario
          </button>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render Call form (cross-suite step call)
   */
  function renderCallForm(step) {
    const call = step.call || {};

    return `
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">📞 Call (Cross-Suite)</h3>
        </div>
        <div class="panel-body">
          <div class="form-group">
            <label class="form-label form-label-required" for="call_suite">Suite</label>
            <input
              type="text"
              id="call_suite"
              class="form-control"
              value="${call.suite || ''}"
              placeholder="../auth/login.yaml"
              required
            >
            <small class="form-hint">Caminho relativo para a suite</small>
          </div>

          <div class="form-group">
            <label class="form-label form-label-required" for="call_step_id">Step ID</label>
            <input
              type="text"
              id="call_step_id"
              class="form-control"
              value="${call.step_id || ''}"
              placeholder="login-step"
              required
            >
            <small class="form-hint">ID do step a ser executado</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="call_variables">Variáveis (JSON)</label>
            <textarea
              id="call_variables"
              class="form-control"
              rows="4"
              placeholder='{"username": "{{test_user}}", "password": "{{test_pass}}"}'
            >${call.variables ? JSON.stringify(call.variables, null, 2) : ''}</textarea>
            <small class="form-hint">Variáveis a passar para o step chamado</small>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="call_isolate" ${call.isolate_context !== false ? 'checked' : ''}>
              Isolar Contexto
            </label>
            <small class="form-hint">Se true, capturas vêm prefixadas com step-id</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="call_on_error">On Error</label>
            <select id="call_on_error" class="form-control">
              <option value="fail" ${call.on_error === 'fail' || !call.on_error ? 'selected' : ''}>Fail</option>
              <option value="warn" ${call.on_error === 'warn' ? 'selected' : ''}>Warn</option>
              <option value="continue" ${call.on_error === 'continue' ? 'selected' : ''}>Continue</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render form for Metadata section
   */
  function renderMetadataForm() {
    const state = YamlState.getState();
    const metadata = state.metadata || {};

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Metadata</h2>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label" for="metadata_priority">Prioridade</label>
            <select id="metadata_priority" class="form-control">
              <option value="">Nenhuma</option>
              <option value="critical" ${metadata.priority === 'critical' ? 'selected' : ''}>Critical</option>
              <option value="high" ${metadata.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="medium" ${metadata.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="low" ${metadata.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="metadata_tags">Tags (separadas por vírgula)</label>
            <input
              type="text"
              id="metadata_tags"
              class="form-control"
              value="${metadata.tags ? metadata.tags.join(', ') : ''}"
              placeholder="smoke, auth, api"
            >
            <small class="form-hint">Ex: smoke, auth, integration</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="metadata_timeout">Timeout (ms)</label>
            <input
              type="number"
              id="metadata_timeout"
              class="form-control"
              value="${metadata.timeout || ''}"
              placeholder="30000"
            >
            <small class="form-hint">Timeout em milissegundos para esta suite</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="metadata_estimated_duration">Duração Estimada (ms)</label>
            <input
              type="number"
              id="metadata_estimated_duration"
              class="form-control"
              value="${metadata.estimated_duration_ms || ''}"
              placeholder="5000"
            >
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                id="metadata_requires_input"
                ${metadata.requires_user_input ? 'checked' : ''}
              >
              Requer Input do Usuário
            </label>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render form for Faker Configuration
   */
  function renderFakerConfigForm() {
    const state = YamlState.getState();
    const faker = state.faker || {};

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">⚙️ Configuração do Faker.js</h2>
        </div>
        <div class="card-body">
          <div class="alert alert-info">
            Configure o Faker.js para gerar dados de teste dinâmicos. Use <code>{{$faker.internet.email}}</code> nos seus campos.
          </div>

          <div class="form-group">
            <label class="form-label" for="faker_locale">Locale</label>
            <select id="faker_locale" class="form-control">
              <option value="">Padrão (en)</option>
              <option value="pt_BR" ${faker.locale === 'pt_BR' ? 'selected' : ''}>Português (pt_BR)</option>
              <option value="en" ${faker.locale === 'en' ? 'selected' : ''}>English (en)</option>
              <option value="es" ${faker.locale === 'es' ? 'selected' : ''}>Español (es)</option>
              <option value="fr" ${faker.locale === 'fr' ? 'selected' : ''}>Français (fr)</option>
              <option value="de" ${faker.locale === 'de' ? 'selected' : ''}>Deutsch (de)</option>
            </select>
            <small class="form-hint">Idioma para geração de dados</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="faker_seed">Seed (opcional)</label>
            <input
              type="number"
              id="faker_seed"
              class="form-control"
              value="${faker.seed || ''}"
              placeholder="12345"
            >
            <small class="form-hint">Seed para resultados reproduzíveis. Deixe vazio para valores aleatórios.</small>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render form for Dependencies
   */
  function renderDependenciesForm() {
    const state = YamlState.getState();
    const depends = state.depends || [];

    let html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">🔗 Dependências</h2>
        </div>
        <div class="card-body">
          <div class="alert alert-info">
            Suites que devem ser executadas antes desta suite. As variáveis exportadas ficam disponíveis.
            <br><strong>Suite Name:</strong> Referência lógica (ex: "auth-login")
            <br><strong>Path:</strong> Caminho do arquivo (ex: "auth/login.yaml")
          </div>

          <button type="button" class="btn btn-primary btn-add-dependency mb-md">
            ➕ Adicionar Dependência
          </button>

          <div id="dependencies-list">
    `;

    if (depends.length === 0) {
      html += '<p class="text-center">Nenhuma dependência adicionada.</p>';
    } else {
      depends.forEach((dep, index) => {
        html += `
          <div class="card mb-md" data-dep-index="${index}">
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Tipo de Referência</label>
                <div class="btn-group" role="group">
                  <input type="radio" class="btn-check" name="dep-type-${index}" id="dep-type-suite-${index}" value="suite" ${!dep.path ? 'checked' : ''}>
                  <label class="btn btn-sm btn-outline-primary dep-type-radio" for="dep-type-suite-${index}" data-index="${index}">Suite Name</label>

                  <input type="radio" class="btn-check" name="dep-type-${index}" id="dep-type-path-${index}" value="path" ${dep.path ? 'checked' : ''}>
                  <label class="btn btn-sm btn-outline-primary dep-type-radio" for="dep-type-path-${index}" data-index="${index}">Path</label>
                </div>
              </div>

              <div class="form-group dep-suite-group-${index}" style="display: ${!dep.path ? 'block' : 'none'}">
                <label class="form-label">Suite Name</label>
                <input
                  type="text"
                  class="form-control dep-suite"
                  value="${dep.suite || ''}"
                  placeholder="auth-login"
                  data-index="${index}"
                >
                <small class="form-hint">Nome lógico da suite</small>
              </div>

              <div class="form-group dep-path-group-${index}" style="display: ${dep.path ? 'block' : 'none'}">
                <label class="form-label">Path</label>
                <input
                  type="text"
                  class="form-control dep-path"
                  value="${dep.path || ''}"
                  placeholder="auth/login.yaml"
                  data-index="${index}"
                >
                <small class="form-hint">Caminho relativo do arquivo YAML</small>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" class="dep-cache" data-index="${index}" ${dep.cache ? 'checked' : ''}>
                  Cache (reutilizar resultado)
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">Retry (tentativas)</label>
                <input
                  type="number"
                  class="form-control dep-retry"
                  value="${dep.retry || 0}"
                  min="0"
                  data-index="${index}"
                >
              </div>

              <button class="btn btn-sm btn-danger btn-remove-dependency" data-index="${index}">
                🗑️ Remover
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `
          </div>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Render form for Exports
   */
  function renderExportsForm() {
    const state = YamlState.getState();
    const exports = state.exports || [];
    const exportsOptional = state.exports_optional || [];

    return `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">📤 Exports</h2>
        </div>
        <div class="card-body">
          <div class="alert alert-info">
            Variáveis capturadas que serão exportadas globalmente para outras suites acessarem como <code>{{suite-name.variable}}</code>.
          </div>

          <div class="form-group">
            <label class="form-label" for="exports_list">Exports Obrigatórios</label>
            <textarea
              id="exports_list"
              class="form-control"
              rows="4"
              placeholder="auth_token&#10;user_id&#10;session_data"
            >${exports.join('\n')}</textarea>
            <small class="form-hint">Um por linha. Estas variáveis DEVEM ser capturadas durante a execução.</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="exports_optional_list">Exports Opcionais</label>
            <textarea
              id="exports_optional_list"
              class="form-control"
              rows="4"
              placeholder="debug_info&#10;extra_data"
            >${exportsOptional.join('\n')}</textarea>
            <small class="form-hint">Um por linha. Estas variáveis são opcionais.</small>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render cURL importer laboratory section
   */
  function renderCurlImporterForm() {
    const labState = CurlLab.getState();
    const suiteState = YamlState.getState();
    const steps = suiteState.steps || [];

    const commandValue = labState.rawCommand || '';
    const parseError = labState.parseError;
    const warnings = labState.warnings || [];
    const parsed = labState.parsedRequest;
    const response = labState.response;
    const suggestions = (parsed && parsed.suggestions) || [];
    const formInputs = labState.formInputs || {
      stepName: '',
      stepId: '',
      target: 'new',
      captureVariable: ''
    };
    const isRunning = labState.isRunning;
    const runError = labState.runError;
    const lastStepIndex = labState.lastStepIndex;
    const currentTarget = formInputs.target != null ? String(formInputs.target) : 'new';
    const executionAdjustments = labState.executionAdjustments || [];
    const usedProxy = Boolean(labState.usedProxy);

    let html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">🧪 Laboratório cURL → Flow Test</h2>
        </div>
        <div class="card-body">
          <p class="card-description">
            Cole um comando cURL (exportado do Postman ou outro cliente) para converter automaticamente em um step de teste
            do Flow Test Engine. Em seguida, execute a request para capturar exemplos de resposta e gerar sugestões de JMESPath.
          </p>
          <div class="form-group">
            <label class="form-label" for="curl-command">Comando cURL</label>
            <textarea
              id="curl-command"
              class="form-control"
              rows="6"
              placeholder="curl --location 'https://api.exemplo.com/users' --header 'Authorization: Bearer TOKEN' --data '{\"name\":\"Flow\"}'"
            >${escapeHtml(commandValue)}</textarea>
            <small class="form-hint">
              Suporta flags comuns como <code>-X</code>, <code>--header</code>, <code>--data</code>, <code>--data-raw</code>, <code>-H</code>.
            </small>
          </div>
          <div class="btn-group">
            <button id="btn-parse-curl" type="button" class="btn btn-primary">Importar cURL</button>
            <button id="btn-clear-curl" type="button" class="btn btn-secondary">Limpar</button>
          </div>
    `;

    if (parseError) {
      html += `
          <div class="alert alert-error mt-sm">
            <strong>Erro:</strong> ${escapeHtml(parseError)}
          </div>
      `;
    }

    if (warnings.length > 0) {
      html += `
          <div class="alert alert-warning mt-sm">
            <strong>Atenção:</strong>
            <ul class="list-unstyled">
              ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
          </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    if (parsed) {
      const headerEntries = Object.entries(parsed.headers || {});
      const queryEntries = Object.entries(parsed.queryParams || {});
      const hasHeaders = headerEntries.length > 0;
      const hasQuery = queryEntries.length > 0;
      const bodyPreview = parsed.bodyObject !== null && parsed.bodyObject !== undefined
        ? JSON.stringify(parsed.bodyObject, null, 2)
        : parsed.bodyString || '';

      html += `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📦 Detalhes Detectados</h3>
          </div>
          <div class="card-body">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Método</span>
                <code>${escapeHtml(parsed.method || 'GET')}</code>
              </div>
              <div class="info-item">
                <span class="info-label">URL completa</span>
                <code>${escapeHtml(parsed.absoluteUrlWithQuery || parsed.absoluteUrl)}</code>
              </div>
              <div class="info-item">
                <span class="info-label">URL para o Step</span>
                <code>${escapeHtml(parsed.stepUrl)}</code>
              </div>
              <div class="info-item">
                <span class="info-label">Base atual da suite</span>
                <code>${escapeHtml(suiteState.base_url || '—')}</code>
              </div>
            </div>
      `;

      if (parsed.suggestedBaseUrl) {
        html += `
            <div class="alert alert-info mt-sm">
              Base URL sugerida: <code>${escapeHtml(parsed.suggestedBaseUrl)}</code>
              <button id="btn-apply-base-url" type="button" class="btn btn-sm btn-secondary" style="margin-left: 12px;">
                Aplicar na suite
              </button>
            </div>
        `;
      } else if (!parsed.matchesSuiteBase) {
        html += `
            <div class="alert alert-warning mt-sm">
              A URL utiliza uma base diferente da configurada na suite.
              Considere definir <code>base_url</code> como <code>${escapeHtml(parsed.baseUrl)}</code>.
            </div>
        `;
      }

      if (hasQuery) {
        html += `
            <div class="alert alert-secondary mt-sm">
              <strong>Query params detectados:</strong>
              <ul class="list-unstyled">
                ${queryEntries.map(([key, value]) => `
                  <li><code>${escapeHtml(key)}</code> = <code>${escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</code></li>
                `).join('')}
              </ul>
              <small class="form-hint">
                Serão adicionados em <code>request.params</code> ao criar o step.
              </small>
            </div>
        `;
      }

      if (hasHeaders) {
        html += `
            <div class="form-group mt-sm">
              <label class="form-label">Headers detectados</label>
              <pre class="code-preview">${escapeHtml(JSON.stringify(parsed.headers, null, 2))}</pre>
            </div>
        `;
      }

      if (bodyPreview) {
        html += `
            <div class="form-group">
              <label class="form-label">Body detectado</label>
              <pre class="code-preview">${escapeHtml(bodyPreview)}</pre>
            </div>
        `;
      }

      const stepOptions = steps.map((step, index) => `
        <option value="${index}" ${currentTarget === String(index) ? 'selected' : ''}>
          #${index + 1} · ${escapeHtml(step.name || `Step ${index + 1}`)}
        </option>
      `).join('');

      html += `
            <div class="divider"></div>
            <h4>Injetar no editor</h4>
            <div class="form-group">
              <label class="form-label" for="curl-step-name">Nome do Step</label>
              <input
                type="text"
                id="curl-step-name"
                class="form-control"
                value="${escapeHtml(formInputs.stepName || parsed.defaultStepName)}"
                placeholder="${escapeHtml(parsed.defaultStepName)}"
              >
            </div>
            <div class="form-group">
              <label class="form-label" for="curl-step-id">Step ID (opcional)</label>
              <input
                type="text"
                id="curl-step-id"
                class="form-control"
                value="${escapeHtml(formInputs.stepId || '')}"
                placeholder="ex: importado-curl"
              >
            </div>
            <div class="form-group">
              <label class="form-label" for="curl-step-target">Destino</label>
              <select id="curl-step-target" class="form-control">
                <option value="new" ${currentTarget === 'new' ? 'selected' : ''}>➕ Criar novo step</option>
                ${stepOptions}
              </select>
              <small class="form-hint">
                Escolha um step existente para sobrescrever os dados ou mantenha "Criar novo".
              </small>
            </div>
            <div class="form-group">
              <button id="btn-apply-step" type="button" class="btn btn-primary">Aplicar no editor</button>
            </div>
      `;

      if (typeof lastStepIndex === 'number' && lastStepIndex >= 0) {
        html += `
            <div class="form-group">
              <p class="form-hint">
                Último step criado/atualizado via Laboratório: <strong>#${lastStepIndex + 1}</strong>.
                Você pode abrir o editor diretamente para revisar os detalhes.
              </p>
              <button id="btn-open-last-step" type="button" class="btn btn-sm btn-secondary">
                Abrir Step #${lastStepIndex + 1}
              </button>
            </div>
        `;
      }

      html += `
          </div>
        </div>
      `;

      html += `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🚀 Executar Request</h3>
          </div>
          <div class="card-body">
            <p class="card-description">
              Execute a request convertida diretamente do navegador para validar a resposta e gerar caminhos JMESPath.
              Atenção: a requisição respeita as restrições de CORS do servidor.
            </p>
            <button id="btn-run-request" type="button" class="btn btn-secondary" ${isRunning ? 'disabled' : ''}>
              ${isRunning ? 'Executando…' : 'Executar request agora'}
            </button>
      `;

      if (usedProxy) {
        html += `
            <div class="alert alert-success mt-sm">
              Requisição executada via proxy local (<code>/__proxy</code>). Todos os headers originais foram encaminhados para o serviço de destino.
            </div>
        `;
      } else if (executionAdjustments.length > 0) {
        html += `
            <div class="alert alert-info mt-sm">
              Para reduzir falhas de CORS, os seguintes headers foram omitidos na execução local:
              ${executionAdjustments.map(header => `<code>${escapeHtml(header)}</code>`).join(', ')}.
              O step gerado mantém a versão original.
            </div>
        `;
      }

      if (runError) {
        html += `
            <div class="alert alert-error mt-sm">
              <strong>Erro ao executar:</strong> ${escapeHtml(runError)}
            </div>
        `;
      }

      if (response) {
        html += `
            <div class="response-summary mt-sm">
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Status</span>
                  <code>${escapeHtml(response.status)} ${escapeHtml(response.statusText || '')}</code>
                </div>
                <div class="info-item">
                  <span class="info-label">Tempo</span>
                  <code>${escapeHtml(response.durationMs)} ms</code>
                </div>
                <div class="info-item">
                  <span class="info-label">Content-Type</span>
                  <code>${escapeHtml(response.contentType || 'desconhecido')}</code>
                </div>
              </div>
        `;

        if (response.bodyError) {
          html += `
              <div class="alert alert-warning mt-sm">
                Não foi possível interpretar o body como JSON: ${escapeHtml(response.bodyError)}
              </div>
          `;
        }

        if (response.bodyText) {
          const previewBody = response.bodyJson
            ? JSON.stringify(response.bodyJson, null, 2)
            : response.bodyText;
          html += `
              <div class="form-group">
                <label class="form-label">Resposta</label>
                <pre class="code-preview">${escapeHtml(previewBody)}</pre>
              </div>
          `;
        }

        html += `
            </div>
        `;
      }

      html += `
          </div>
        </div>
      `;

      if (suggestions.length > 0) {
        html += `
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">🔎 Sugestões de JMESPath</h3>
            </div>
            <div class="card-body">
              <p class="card-description">
                Use as sugestões abaixo para montar <code>capture</code>, <code>assert</code> e configurações de <code>input</code>.
                Defina um nome base para capturas rápidas e clique em "Adicionar captura".
              </p>
              <div class="form-group">
                <label class="form-label" for="curl-capture-variable">Nome padrão para captura</label>
                <input
                  type="text"
                  id="curl-capture-variable"
                  class="form-control form-control-sm"
                  value="${escapeHtml(formInputs.captureVariable || '')}"
                  placeholder="ex: auth_token"
                >
                <small class="form-hint">Este nome será utilizado ao adicionar capturas automaticamente.</small>
              </div>
        `;

        suggestions.forEach((group, groupIndex) => {
          html += `
              <div class="suggestion-group">
                <h4>${escapeHtml(group.title || 'Sugestões')}</h4>
                <div class="suggestion-list" data-group="${groupIndex}">
                  ${group.items.map(item => `
                    <div class="suggestion-item">
                      <div class="suggestion-header">
                        <code class="suggestion-path">${escapeHtml(item.path)}</code>
                        <span class="badge badge-muted">${escapeHtml(item.type || '')}</span>
                      </div>
                      <div class="suggestion-preview">${escapeHtml(item.preview || '')}</div>
                      <div class="suggestion-actions">
                        <button
                          type="button"
                          class="btn btn-sm btn-secondary suggestion-copy"
                          data-path="${escapeHtml(item.path)}"
                        >
                          Copiar caminho
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-primary suggestion-capture"
                          data-path="${escapeHtml(item.path)}"
                        >
                          Adicionar captura
                        </button>
                        <button
                          type="button"
                          class="btn btn-sm btn-success suggestion-assert"
                          data-path="${escapeHtml(item.path)}"
                          data-type="${escapeHtml(item.type || '')}"
                          data-value="${item.value === undefined ? '' : escapeHtml(encodeURIComponent(JSON.stringify(item.value)))}"
                          data-preview="${escapeHtml(item.preview || '')}"
                        >
                          Criar assert
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      }
    } else {
      html += `
        <div class="card">
          <div class="card-body">
            <p class="card-description">
              Importe um comando cURL para visualizar detalhes, gerar steps automaticamente e preparar capturas.
            </p>
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Render a specific section
   * @param {string} section - Section identifier
   * @param {Object} options - Additional options
   * @returns {string} HTML string
   */
  function renderSection(section, options = {}) {
    switch (section) {
      case 'suite-config':
        return renderSuiteConfigForm();
      case 'steps-list':
        return renderStepsListForm();
      case 'steps-add':
        return renderStepForm(options.stepIndex);
      case 'metadata':
        return renderMetadataForm();
      case 'faker-config':
        return renderFakerConfigForm();
      case 'dependencies':
        return renderDependenciesForm();
      case 'exports':
        return renderExportsForm();
      case 'curl-importer':
        return renderCurlImporterForm();
      default:
        return '<p>Seção não implementada ainda.</p>';
    }
  }

  /**
   * Attach event listeners to form fields for a section
   * @param {string} section - Section identifier
   */
  function attachEventListeners(section) {
    switch (section) {
      case 'suite-config':
        attachSuiteConfigListeners();
        break;
      case 'steps-list':
        attachStepsListListeners();
        break;
      case 'steps-add':
        attachStepFormListeners();
        break;
      case 'metadata':
        attachMetadataListeners();
        break;
      case 'faker-config':
        attachFakerConfigListeners();
        break;
      case 'dependencies':
        attachDependenciesListeners();
        break;
      case 'exports':
        attachExportsListeners();
        break;
      case 'curl-importer':
        attachCurlImporterListeners();
        break;
    }
  }

  /**
   * Helper to re-render cURL importer section
   */
  function rerenderCurlImporterSection() {
    const container = document.getElementById('form-container');
    if (!container) return;
    container.innerHTML = renderCurlImporterForm();
    attachEventListeners('curl-importer');
  }

  /**
   * Event bindings for cURL importer section
   */
  function attachCurlImporterListeners() {
    const parseBtn = document.getElementById('btn-parse-curl');
    const clearBtn = document.getElementById('btn-clear-curl');
    const commandInput = document.getElementById('curl-command');
    const baseUrlBtn = document.getElementById('btn-apply-base-url');
    const stepNameInput = document.getElementById('curl-step-name');
    const stepIdInput = document.getElementById('curl-step-id');
    const stepTargetSelect = document.getElementById('curl-step-target');
    const applyStepBtn = document.getElementById('btn-apply-step');
    const runBtn = document.getElementById('btn-run-request');
    const captureInput = document.getElementById('curl-capture-variable');
    const openLastStepBtn = document.getElementById('btn-open-last-step');

    if (parseBtn && commandInput) {
      parseBtn.addEventListener('click', (event) => {
        event.preventDefault();
        CurlLab.parseCommand(commandInput.value);
        rerenderCurlImporterSection();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        CurlLab.clear();
        rerenderCurlImporterSection();
      });
    }

    if (baseUrlBtn) {
      baseUrlBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const parsed = CurlLab.getState().parsedRequest;
        if (parsed && parsed.suggestedBaseUrl) {
          YamlState.updateField('base_url', parsed.suggestedBaseUrl);
          FileManager.showToast('base_url atualizado com a sugestão do cURL.', 'success');
          rerenderCurlImporterSection();
        }
      });
    }

    if (stepNameInput) {
      stepNameInput.addEventListener('input', () => {
        CurlLab.updateFormInputs({ stepName: stepNameInput.value });
      });
    }

    if (stepIdInput) {
      stepIdInput.addEventListener('input', () => {
        CurlLab.updateFormInputs({ stepId: stepIdInput.value });
      });
    }

    if (stepTargetSelect) {
      stepTargetSelect.addEventListener('change', () => {
        CurlLab.updateFormInputs({ target: stepTargetSelect.value });
      });
    }

    if (captureInput) {
      captureInput.addEventListener('input', () => {
        CurlLab.updateFormInputs({ captureVariable: captureInput.value });
      });
    }

    if (applyStepBtn) {
      applyStepBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const labState = CurlLab.getState();
        const inputs = labState.formInputs || {};
        CurlLab.applyStep({
          target: inputs.target,
          stepName: inputs.stepName,
          stepId: inputs.stepId
        });
        rerenderCurlImporterSection();
      });
    }

    if (openLastStepBtn) {
      openLastStepBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const labState = CurlLab.getState();
        const lastIndex = labState.lastStepIndex;
        if (typeof lastIndex === 'number' && lastIndex >= 0) {
          window.App.navigateTo('steps-add', { stepIndex: lastIndex });
        } else {
          FileManager.showToast('Nenhum step foi criado ainda pelo laboratório.', 'info');
        }
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const runPromise = CurlLab.runParsedRequest();
        rerenderCurlImporterSection();
        Promise.resolve(runPromise)
          .finally(() => rerenderCurlImporterSection());
      });
    }

    document.querySelectorAll('.suggestion-list').forEach(list => {
      list.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const path = target.getAttribute('data-path') || '';

        if (target.classList.contains('suggestion-copy')) {
          if (path) {
            FileManager.copyToClipboard(path);
          }
          return;
        }

        if (target.classList.contains('suggestion-capture')) {
          if (!path) return;
          const labState = CurlLab.getState();
          const inputs = labState.formInputs || {};
          const explicitTarget = inputs.target === 'new'
            ? null
            : (Number.isNaN(parseInt(inputs.target, 10)) ? null : parseInt(inputs.target, 10));
          const resolvedIndex = explicitTarget !== null
            ? explicitTarget
            : (typeof labState.lastStepIndex === 'number' ? labState.lastStepIndex : null);

          if (resolvedIndex === null || (resolvedIndex !== null && !YamlState.getStep(resolvedIndex))) {
            FileManager.showToast('Crie ou selecione um step antes de adicionar capturas.', 'info');
            return;
          }

          const variableName = (inputs.captureVariable || '').trim();
          const applyCapture = (name) => {
            CurlLab.updateFormInputs({ captureVariable: name });
            CurlLab.addCapture(path, explicitTarget, name);
            rerenderCurlImporterSection();
          };

          if (!variableName) {
            const suggestion = suggestVariableName(path);
            showCaptureNameModal(suggestion, applyCapture);
          } else {
            applyCapture(variableName);
          }
          return;
        }

        if (target.classList.contains('suggestion-assert')) {
          if (!path) return;

          const labState = CurlLab.getState();
          const inputs = labState.formInputs || {};
          const explicitTarget = inputs.target === 'new'
            ? null
            : (Number.isNaN(parseInt(inputs.target, 10)) ? null : parseInt(inputs.target, 10));
          const resolvedIndex = explicitTarget !== null
            ? explicitTarget
            : (typeof labState.lastStepIndex === 'number' ? labState.lastStepIndex : null);

          if (resolvedIndex === null || (resolvedIndex !== null && !YamlState.getStep(resolvedIndex))) {
            FileManager.showToast('Crie ou selecione um step antes de adicionar asserts.', 'info');
            return;
          }

          const type = target.getAttribute('data-type') || '';
          const encodedValue = target.getAttribute('data-value') || '';
          const preview = target.getAttribute('data-preview') || '';
          let actualValue;

          if (encodedValue) {
            try {
              actualValue = JSON.parse(decodeURIComponent(encodedValue));
            } catch {
              actualValue = undefined;
            }
          }

          showAssertionModal({
            path,
            type,
            value: actualValue,
            preview,
            onConfirm: (config) => {
              CurlLab.addAssertion(path, config, explicitTarget);
              rerenderCurlImporterSection();
            }
          });
        }
      });
    });
  }


  function attachSuiteConfigListeners() {
    const nodeIdInput = document.getElementById('node_id');
    const suiteNameInput = document.getElementById('suite_name');
    const descriptionInput = document.getElementById('description');
    const baseUrlInput = document.getElementById('base_url');
    const executionModeSelect = document.getElementById('execution_mode');

    if (nodeIdInput) {
      Validator.attachLiveValidation(nodeIdInput, {
        required: true,
        type: 'kebab-case'
      }, (validation) => {
        if (validation.valid) {
          YamlState.updateField('node_id', nodeIdInput.value);
        }
      });
    }

    if (suiteNameInput) {
      Validator.attachLiveValidation(suiteNameInput, { required: true }, (validation) => {
        if (validation.valid) {
          YamlState.updateField('suite_name', suiteNameInput.value);
        }
      });
    }

    if (descriptionInput) {
      descriptionInput.addEventListener('blur', () => {
        YamlState.updateField('description', descriptionInput.value);
      });
    }

    if (baseUrlInput) {
      Validator.attachLiveValidation(baseUrlInput, { type: 'url' }, (validation) => {
        if (validation.valid || baseUrlInput.value === '') {
          YamlState.updateField('base_url', baseUrlInput.value);
        }
      });
    }

    if (executionModeSelect) {
      executionModeSelect.addEventListener('change', () => {
        YamlState.updateField('execution_mode', executionModeSelect.value);
      });
    }
  }

  function attachStepsListListeners() {
    const addStepBtn = document.getElementById('btn-add-step');
    if (addStepBtn) {
      addStepBtn.addEventListener('click', () => {
        window.App.navigateTo('steps-add');
      });
    }

    document.querySelectorAll('.btn-edit-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        window.App.navigateTo('steps-add', { stepIndex: index });
      });
    });

    document.querySelectorAll('.btn-delete-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        if (confirm('Tem certeza que deseja remover este step?')) {
          YamlState.removeStep(index);
          window.App.navigateTo('steps-list');
        }
      });
    });
  }

  function attachStepFormListeners() {
    // Listener para mudança de tipo de step
    const stepTypeSelect = document.getElementById('step_type');
    if (stepTypeSelect) {
      stepTypeSelect.addEventListener('change', () => {
        const stepIndex = document.getElementById('step_index').value;
        const currentName = document.getElementById('step_name').value;
        const currentStepId = document.getElementById('step_step_id').value;

        // Preservar dados básicos
        const tempStep = {
          name: currentName,
          step_id: currentStepId
        };

        // Re-renderizar o formulário do tipo
        const formContainer = document.getElementById('step-type-forms');
        if (formContainer) {
          formContainer.innerHTML = renderStepTypeForm(stepTypeSelect.value, tempStep);
          // Re-attach listeners para o novo form
          attachStepTypeSpecificListeners(stepTypeSelect.value);
        }
      });
    }

    // Listener para mudança de tipo de loop
    const loopTypeSelect = document.getElementById('loop_type');
    if (loopTypeSelect) {
      loopTypeSelect.addEventListener('change', () => {
        const arrayForm = document.getElementById('loop-array-form');
        const rangeForm = document.getElementById('loop-range-form');
        if (loopTypeSelect.value === 'array') {
          arrayForm.style.display = 'block';
          rangeForm.style.display = 'none';
        } else {
          arrayForm.style.display = 'none';
          rangeForm.style.display = 'block';
        }
      });
    }

    const saveBtn = document.getElementById('btn-save-step');
    const cancelBtn = document.getElementById('btn-cancel-step');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const stepIndexInput = document.getElementById('step_index');
        const stepIndex = stepIndexInput.value !== '' ? parseInt(stepIndexInput.value) : null;
        const stepType = document.getElementById('step_type').value;

        const stepData = {
          name: document.getElementById('step_name').value,
          step_id: document.getElementById('step_step_id').value || undefined
        };

        // Adicionar dados específicos do tipo
        try {
          switch (stepType) {
            case 'http-request':
              stepData.request = {
                method: document.getElementById('step_method').value,
                url: document.getElementById('step_url').value
              };

              // Headers - check which mode is active
              const headersRawDiv = document.getElementById('headers-raw');
              if (headersRawDiv.style.display !== 'none') {
                // Raw mode
                const headersText = document.getElementById('step_headers_raw').value.trim();
                if (headersText) {
                  stepData.request.headers = JSON.parse(headersText);
                }
              } else {
                // Fields mode
                stepData.request.headers = parseKeyValueEditor('headers');
              }

              // Params
              const paramsRawDiv = document.getElementById('params-raw');
              if (paramsRawDiv.style.display !== 'none') {
                const paramsText = document.getElementById('step_params_raw').value.trim();
                if (paramsText) {
                  stepData.request.params = JSON.parse(paramsText);
                }
              } else {
                stepData.request.params = parseKeyValueEditor('params');
              }

              // Body
              const bodyRawDiv = document.getElementById('body-raw');
              if (bodyRawDiv.style.display !== 'none') {
                const bodyText = document.getElementById('step_body_raw').value.trim();
                if (bodyText) {
                  stepData.request.body = JSON.parse(bodyText);
                }
              } else {
                stepData.request.body = parseKeyValueEditor('body');
              }

              // Timeout
              const timeout = document.getElementById('step_timeout').value;
              if (timeout) {
                stepData.request.timeout = parseInt(timeout);
              }

              // Assertions
              const statusCode = document.getElementById('step_assert_status').value;
              if (statusCode) {
                stepData.assert = { status_code: parseInt(statusCode) };

                // Body assertions
                const assertionsRawDiv = document.getElementById('assertions-raw');
                if (assertionsRawDiv.style.display !== 'none') {
                  const assertBodyText = document.getElementById('step_assert_body_raw').value.trim();
                  if (assertBodyText) {
                    stepData.assert.body = JSON.parse(assertBodyText);
                  }
                } else {
                  const bodyAsserts = parseAssertionBuilder('assertions');
                  if (Object.keys(bodyAsserts).length > 0) {
                    stepData.assert.body = bodyAsserts;
                  }
                }
              }

              // Capture
              const captureRawDiv = document.getElementById('capture-raw');
              if (captureRawDiv.style.display !== 'none') {
                const captureText = document.getElementById('step_capture_raw').value.trim();
                if (captureText) {
                  stepData.capture = JSON.parse(captureText);
                }
              } else {
                stepData.capture = parseKeyValueEditor('capture');
              }
              break;

            case 'input':
              stepData.input = {
                prompt: document.getElementById('input_prompt').value,
                variable: document.getElementById('input_variable').value,
                type: document.getElementById('input_type').value,
                default: document.getElementById('input_default').value || undefined,
                ci_default: document.getElementById('input_ci_default').value || undefined,
                required: document.getElementById('input_required').checked
              };
              break;

            case 'loop':
              // Iterate config is already managed through state updates
              // Just retrieve it from current state
              const loopState = YamlState.getState();
              const loopStep = stepIndex !== null ? loopState.steps[stepIndex] : null;
              const iterate = loopStep?.iterate || {};

              // Validate required fields
              const loopType = document.getElementById('loop_type').value;
              if (loopType === 'array') {
                if (!iterate.over) {
                  alert('Campo "Array" é obrigatório para loop de array');
                  return;
                }
              } else {
                if (!iterate.range) {
                  alert('Campo "Range" é obrigatório para loop de range');
                  return;
                }
              }

              if (!iterate.as) {
                alert('Campo "Nome da Variável" é obrigatório');
                return;
              }

              stepData.iterate = iterate;
              break;

            case 'scenario':
              // Scenarios are already managed through state updates
              // Just verify we have at least one scenario with condition
              const state = YamlState.getState();
              const currentStep = stepIndex !== null ? state.steps[stepIndex] : null;
              const scenarios = currentStep?.scenarios || [];

              if (scenarios.length === 0 || !scenarios[0].condition) {
                alert('Pelo menos um scenario com condição é obrigatório');
                return;
              }

              stepData.scenarios = scenarios;
              break;

            case 'call':
              const callVariablesText = document.getElementById('call_variables').value.trim();
              stepData.call = {
                suite: document.getElementById('call_suite').value,
                step_id: document.getElementById('call_step_id').value,
                isolate_context: document.getElementById('call_isolate').checked,
                on_error: document.getElementById('call_on_error').value
              };
              if (callVariablesText) {
                stepData.call.variables = JSON.parse(callVariablesText);
              }
              break;
          }

          if (stepIndex !== null) {
            YamlState.updateStep(stepIndex, stepData);
          } else {
            YamlState.addStep(stepData);
          }

          window.App.navigateTo('steps-list');
        } catch (error) {
          alert('Erro ao processar dados: ' + error.message);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        window.App.navigateTo('steps-list');
      });
    }

    // Attach listeners específicos do tipo atual
    const currentType = stepTypeSelect ? stepTypeSelect.value : 'http-request';
    attachStepTypeSpecificListeners(currentType);
  }

  function attachStepTypeSpecificListeners(stepType) {
    // Attach toggle listeners
    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const toggleId = e.currentTarget.dataset.toggle;
        const mode = e.currentTarget.dataset.mode;

        // Update button states
        document.querySelectorAll(`[data-toggle="${toggleId}"]`).forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        e.currentTarget.classList.remove('btn-secondary');
        e.currentTarget.classList.add('btn-primary');

        // Toggle visibility
        const rawDiv = document.getElementById(`${toggleId}-raw`);
        const fieldsDiv = document.getElementById(`${toggleId}-fields`);

        if (mode === 'raw') {
          rawDiv.style.display = 'block';
          fieldsDiv.style.display = 'none';
        } else {
          rawDiv.style.display = 'none';
          fieldsDiv.style.display = 'block';
        }
      });
    });

    // Attach key-value editor listeners
    document.querySelectorAll('.kv-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const editorId = e.currentTarget.dataset.editor;
        const editor = document.querySelector(`[data-editor="${editorId}"]`);
        const rowId = generateId();

        const newRow = document.createElement('div');
        newRow.className = 'key-value-row';
        newRow.dataset.row = rowId;
        newRow.innerHTML = `
          <input type="text" class="form-control form-control-sm kv-key" placeholder="key" style="width: 40%; display: inline-block;">
          <span style="margin: 0 8px;">:</span>
          <input type="text" class="form-control form-control-sm kv-value" placeholder="value" style="width: 45%; display: inline-block;">
          <button type="button" class="btn btn-sm btn-danger kv-remove" style="margin-left: 8px;">🗑️</button>
        `;

        editor.insertBefore(newRow, btn);

        // Attach remove listener to new row
        newRow.querySelector('.kv-remove').addEventListener('click', () => {
          newRow.remove();
        });
      });
    });

    document.querySelectorAll('.kv-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.currentTarget.closest('.key-value-row').remove();
      });
    });

    // Attach assertion builder listeners
    document.querySelectorAll('.assert-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const builderId = e.currentTarget.dataset.builder;
        const builder = document.querySelector(`[data-builder="${builderId}"]`);
        const rowId = generateId();

        const newRow = document.createElement('div');
        newRow.className = 'assertion-row card mb-sm';
        newRow.dataset.row = rowId;
        newRow.innerHTML = `
          <div class="card-body" style="padding: 12px;">
            <div class="form-group mb-sm">
              <label class="form-label-sm">Campo (path)</label>
              <input type="text" class="form-control form-control-sm assert-path" placeholder="user.email">
            </div>
            <div class="form-group mb-sm">
              <label class="form-label-sm">Operador</label>
              <select class="form-control form-control-sm assert-operator">
                <option value="exists">Exists</option>
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="regex">Regex</option>
                <option value="type">Type</option>
                <option value="length">Length</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
              </select>
            </div>
            <div class="form-group mb-sm">
              <label class="form-label-sm">Valor</label>
              <input type="text" class="form-control form-control-sm assert-value" placeholder="valor esperado">
            </div>
            <button type="button" class="btn btn-sm btn-danger assert-remove">🗑️ Remover</button>
          </div>
        `;

        builder.insertBefore(newRow, btn);

        // Attach remove listener
        newRow.querySelector('.assert-remove').addEventListener('click', () => {
          newRow.remove();
        });
      });
    });

    document.querySelectorAll('.assert-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.currentTarget.closest('.assertion-row').remove();
      });
    });

    // ============================================
    // SCENARIO EDITOR LISTENERS
    // ============================================

    // Add new scenario
    const scenarioAddBtn = document.getElementById('scenario-add');
    if (scenarioAddBtn) {
      scenarioAddBtn.addEventListener('click', () => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = step.scenarios || [];
        scenarios.push({ condition: '', steps: [] });

        YamlState.updateStep(stepIndex, { ...step, scenarios });
        window.App.navigateTo('step-edit');
      });
    }

    // Remove scenario
    document.querySelectorAll('.scenario-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        if (!confirm('Remover este scenario?')) return;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        scenarios.splice(index, 1);

        YamlState.updateStep(stepIndex, { ...step, scenarios });
        window.App.navigateTo('step-edit');
      });
    });

    // Update scenario condition
    document.querySelectorAll('.scenario-condition').forEach(input => {
      input.addEventListener('blur', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        scenarios[index].condition = value;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
      });
    });

    // Add step to scenario
    document.querySelectorAll('.scenario-add-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];

        steps.push({
          name: 'New Step',
          request: {
            method: 'GET',
            url: '/api/endpoint'
          }
        });

        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
        window.App.navigateTo('step-edit');
      });
    });

    // Remove step from scenario
    document.querySelectorAll('.scenario-step-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);
        const stepIdx = parseInt(e.currentTarget.dataset.step);

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];

        steps.splice(stepIdx, 1);
        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
        window.App.navigateTo('step-edit');
      });
    });

    // Update scenario step name
    document.querySelectorAll('.scenario-step-name').forEach(input => {
      input.addEventListener('blur', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];

        steps[stepIdx].name = value;
        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
      });
    });

    // Update scenario step type
    document.querySelectorAll('.scenario-step-type').forEach(select => {
      select.addEventListener('change', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];
        const childStep = steps[stepIdx];

        // Update step structure based on type
        if (value === 'http') {
          childStep.request = childStep.request || { method: 'GET', url: '/api/endpoint' };
        } else if (value === 'capture') {
          delete childStep.request;
          childStep.capture = childStep.capture || {};
        } else if (value === 'assert') {
          delete childStep.request;
          childStep.assert = childStep.assert || {};
        }

        steps[stepIdx] = childStep;
        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
        window.App.navigateTo('step-edit');
      });
    });

    // Update scenario step HTTP config
    document.querySelectorAll('.scenario-step-method').forEach(select => {
      select.addEventListener('change', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];

        steps[stepIdx].request = steps[stepIdx].request || {};
        steps[stepIdx].request.method = value;

        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
      });
    });

    document.querySelectorAll('.scenario-step-url').forEach(input => {
      input.addEventListener('blur', (e) => {
        const scenarioIndex = parseInt(e.currentTarget.dataset.scenario);
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const scenarios = [...(step.scenarios || [])];
        const scenario = scenarios[scenarioIndex];
        const steps = [...(scenario.steps || [])];

        steps[stepIdx].request = steps[stepIdx].request || {};
        steps[stepIdx].request.url = value;

        scenario.steps = steps;
        scenarios[scenarioIndex] = scenario;

        YamlState.updateStep(stepIndex, { ...step, scenarios });
      });
    });

    // ============================================
    // LOOP EDITOR LISTENERS
    // ============================================

    // Toggle loop type (array vs range)
    const loopTypeSelect = document.getElementById('loop_type');
    if (loopTypeSelect) {
      loopTypeSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        const arrayForm = document.getElementById('loop-array-form');
        const rangeForm = document.getElementById('loop-range-form');

        if (type === 'array') {
          arrayForm.style.display = 'block';
          rangeForm.style.display = 'none';
        } else {
          arrayForm.style.display = 'none';
          rangeForm.style.display = 'block';
        }
      });
    }

    // Add step to loop
    const loopAddStepBtn = document.getElementById('loop-add-step');
    if (loopAddStepBtn) {
      loopAddStepBtn.addEventListener('click', () => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];

        steps.push({
          name: 'New Step',
          request: {
            method: 'GET',
            url: '/api/endpoint'
          }
        });

        iterate.steps = steps;
        YamlState.updateStep(stepIndex, { ...step, iterate });
        window.App.navigateTo('step-edit');
      });
    }

    // Remove step from loop
    document.querySelectorAll('.loop-step-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const stepIdx = parseInt(e.currentTarget.dataset.step);

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];

        steps.splice(stepIdx, 1);
        iterate.steps = steps;

        YamlState.updateStep(stepIndex, { ...step, iterate });
        window.App.navigateTo('step-edit');
      });
    });

    // Update loop step name
    document.querySelectorAll('.loop-step-name').forEach(input => {
      input.addEventListener('blur', (e) => {
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];

        steps[stepIdx].name = value;
        iterate.steps = steps;

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    });

    // Update loop step type
    document.querySelectorAll('.loop-step-type').forEach(select => {
      select.addEventListener('change', (e) => {
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];
        const childStep = steps[stepIdx];

        // Update step structure based on type
        if (value === 'http') {
          childStep.request = childStep.request || { method: 'GET', url: '/api/endpoint' };
        } else if (value === 'capture') {
          delete childStep.request;
          childStep.capture = childStep.capture || {};
        } else if (value === 'assert') {
          delete childStep.request;
          childStep.assert = childStep.assert || {};
        }

        steps[stepIdx] = childStep;
        iterate.steps = steps;

        YamlState.updateStep(stepIndex, { ...step, iterate });
        window.App.navigateTo('step-edit');
      });
    });

    // Update loop step HTTP config
    document.querySelectorAll('.loop-step-method').forEach(select => {
      select.addEventListener('change', (e) => {
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];

        steps[stepIdx].request = steps[stepIdx].request || {};
        steps[stepIdx].request.method = value;

        iterate.steps = steps;

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    });

    document.querySelectorAll('.loop-step-url').forEach(input => {
      input.addEventListener('blur', (e) => {
        const stepIdx = parseInt(e.currentTarget.dataset.step);
        const value = e.currentTarget.value;

        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}) };
        const steps = [...(iterate.steps || [])];

        steps[stepIdx].request = steps[stepIdx].request || {};
        steps[stepIdx].request.url = value;

        iterate.steps = steps;

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    });

    // Update loop configuration fields
    const loopOverInput = document.getElementById('loop_over');
    const loopAsInput = document.getElementById('loop_as');
    const loopRangeInput = document.getElementById('loop_range');
    const loopRangeAsInput = document.getElementById('loop_range_as');

    if (loopOverInput) {
      loopOverInput.addEventListener('blur', (e) => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}), over: e.target.value };
        delete iterate.range; // Remove range se usando array

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    }

    if (loopAsInput) {
      loopAsInput.addEventListener('blur', (e) => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}), as: e.target.value };

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    }

    if (loopRangeInput) {
      loopRangeInput.addEventListener('blur', (e) => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}), range: e.target.value };
        delete iterate.over; // Remove over se usando range

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    }

    if (loopRangeAsInput) {
      loopRangeAsInput.addEventListener('blur', (e) => {
        const state = YamlState.getState();
        const stepIndex = state.currentStepIndex;
        if (stepIndex === null) return;

        const step = state.steps[stepIndex];
        const iterate = { ...(step.iterate || {}), as: e.target.value };

        YamlState.updateStep(stepIndex, { ...step, iterate });
      });
    }
  }

  function attachMetadataListeners() {
    const prioritySelect = document.getElementById('metadata_priority');
    const tagsInput = document.getElementById('metadata_tags');
    const timeoutInput = document.getElementById('metadata_timeout');
    const estimatedInput = document.getElementById('metadata_estimated_duration');
    const requiresInput = document.getElementById('metadata_requires_input');

    if (prioritySelect) {
      prioritySelect.addEventListener('change', () => {
        YamlState.updateField('metadata.priority', prioritySelect.value);
      });
    }

    if (tagsInput) {
      tagsInput.addEventListener('blur', () => {
        const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);
        YamlState.updateField('metadata.tags', tags);
      });
    }

    if (timeoutInput) {
      timeoutInput.addEventListener('blur', () => {
        const value = parseInt(timeoutInput.value);
        YamlState.updateField('metadata.timeout', isNaN(value) ? null : value);
      });
    }

    if (estimatedInput) {
      estimatedInput.addEventListener('blur', () => {
        const value = parseInt(estimatedInput.value);
        YamlState.updateField('metadata.estimated_duration_ms', isNaN(value) ? null : value);
      });
    }

    if (requiresInput) {
      requiresInput.addEventListener('change', () => {
        YamlState.updateField('metadata.requires_user_input', requiresInput.checked);
      });
    }
  }

  function attachFakerConfigListeners() {
    const localeSelect = document.getElementById('faker_locale');
    const seedInput = document.getElementById('faker_seed');

    if (localeSelect) {
      localeSelect.addEventListener('change', () => {
        const value = localeSelect.value;
        if (value) {
          YamlState.updateField('faker.locale', value);
        } else {
          YamlState.updateField('faker', null);
        }
      });
    }

    if (seedInput) {
      seedInput.addEventListener('blur', () => {
        const value = parseInt(seedInput.value);
        if (!isNaN(value)) {
          YamlState.updateField('faker.seed', value);
        }
      });
    }
  }

  function attachDependenciesListeners() {
    const addBtn = document.querySelector('.btn-add-dependency');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const state = YamlState.getState();
        const depends = state.depends || [];
        depends.push({ suite: '', cache: false, retry: 0 });
        YamlState.updateField('depends', depends);
        window.App.navigateTo('dependencies');
      });
    }

    // Radio button listeners for type toggle
    document.querySelectorAll('.dep-type-radio').forEach(radio => {
      radio.addEventListener('click', (e) => {
        const index = e.target.dataset.index || e.target.htmlFor.split('-').pop();
        const suiteGroup = document.querySelector(`.dep-suite-group-${index}`);
        const pathGroup = document.querySelector(`.dep-path-group-${index}`);
        const radioValue = document.querySelector(`input[name="dep-type-${index}"]:checked`).value;

        if (radioValue === 'suite') {
          suiteGroup.style.display = 'block';
          pathGroup.style.display = 'none';
        } else {
          suiteGroup.style.display = 'none';
          pathGroup.style.display = 'block';
        }
      });
    });

    document.querySelectorAll('.dep-suite').forEach(input => {
      input.addEventListener('blur', (e) => {
        const index = parseInt(e.target.dataset.index);
        const state = YamlState.getState();
        const depends = [...(state.depends || [])];
        depends[index].suite = e.target.value;
        delete depends[index].path; // Remove path if using suite
        YamlState.updateField('depends', depends);
      });
    });

    document.querySelectorAll('.dep-path').forEach(input => {
      input.addEventListener('blur', (e) => {
        const index = parseInt(e.target.dataset.index);
        const state = YamlState.getState();
        const depends = [...(state.depends || [])];
        depends[index].path = e.target.value;
        delete depends[index].suite; // Remove suite if using path
        YamlState.updateField('depends', depends);
      });
    });

    document.querySelectorAll('.dep-cache').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        const state = YamlState.getState();
        const depends = [...(state.depends || [])];
        depends[index].cache = e.target.checked;
        YamlState.updateField('depends', depends);
      });
    });

    document.querySelectorAll('.dep-retry').forEach(input => {
      input.addEventListener('blur', (e) => {
        const index = parseInt(e.target.dataset.index);
        const value = parseInt(e.target.value);
        if (!isNaN(value)) {
          const state = YamlState.getState();
          const depends = [...(state.depends || [])];
          depends[index].retry = value;
          YamlState.updateField('depends', depends);
        }
      });
    });

    document.querySelectorAll('.btn-remove-dependency').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        if (confirm('Remover esta dependência?')) {
          const state = YamlState.getState();
          const depends = [...(state.depends || [])];
          depends.splice(index, 1);
          YamlState.updateField('depends', depends);
          window.App.navigateTo('dependencies');
        }
      });
    });
  }

  function attachExportsListeners() {
    const exportsInput = document.getElementById('exports_list');
    const exportsOptionalInput = document.getElementById('exports_optional_list');

    if (exportsInput) {
      exportsInput.addEventListener('blur', () => {
        const exports = exportsInput.value.split('\n').map(e => e.trim()).filter(e => e);
        YamlState.updateField('exports', exports);
      });
    }

    if (exportsOptionalInput) {
      exportsOptionalInput.addEventListener('blur', () => {
        const exports = exportsOptionalInput.value.split('\n').map(e => e.trim()).filter(e => e);
        YamlState.updateField('exports_optional', exports);
      });
    }
  }

  // Public API
  return {
    renderSection,
    attachEventListeners
  };
})();

// Make available globally
window.FormRenderer = FormRenderer;
