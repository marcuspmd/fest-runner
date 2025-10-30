/**
 * vscode-bridge.js - VSCode API Integration Layer
 *
 * Bridges browser APIs used in the standalone app to VSCode WebView APIs.
 * This allows the existing file-manager.js and other modules to work
 * inside VSCode without modification.
 */

console.log('=== VSCode Bridge - Script loaded and executing ===');

(function() {
  'use strict';

  console.log('VSCode Bridge - IIFE started');

  // Use VSCode API that was already acquired in the HTML
  // (acquireVsCodeApi can only be called once, and we already did it inline)
  const vscode = window.vscode;

  console.log('VSCode Bridge - window.vscode exists:', !!vscode);

  if (!vscode) {
    console.error('VSCode Bridge - window.vscode is not available!');
    return;
  }

  console.log('VSCode Bridge - Starting initialization...');

  /**
   * Disable curl-lab's built-in proxy
   * We want ALL external requests to go through our fetch() interceptor
   */
  window.CurlLabConfig = {
    disableProxy: true
  };

  console.log('VSCode Bridge - CurlLabConfig set, disableProxy:', window.CurlLabConfig.disableProxy);

  /**
   * Override FileManager methods
   * Wait for FileManager to be available since it loads after this script
   */
  function overrideFileManager() {
    if (!window.FileManager) {
      console.log('VSCode Bridge - FileManager not yet available, will retry...');
      setTimeout(overrideFileManager, 50);
      return;
    }

    console.log('VSCode Bridge - FileManager found, overriding methods...');

    /**
     * Override FileManager.saveFile to use VSCode API
     */
    window.FileManager.saveFile = function(filename = null) {
    try {
      // Validate state before saving
      const validation = YamlState.validateState();
      if (!validation.valid) {
        const errorMsg = validation.errors.join('\n');
        window.FileManager.showToast(`Não é possível salvar. Erros:\n${errorMsg}`, 'error');
        return;
      }

      const state = YamlState.getState();

      // Send message to extension to handle file save
      vscode.postMessage({
        type: 'save-to-file',
        payload: state
      });

      // Mark state as clean (extension will confirm save)
      YamlState.markClean();

    } catch (error) {
      window.FileManager.showToast(`Erro ao salvar arquivo: ${error.message}`, 'error');
      console.error('VSCode Bridge - Save error:', error);
    }
  };

  /**
   * Override FileManager.openFile to use VSCode API
   */
  window.FileManager.openFile = function(fileInput, callback) {
    // Ignore fileInput parameter in VSCode context
    // Send message to extension to show file picker
    vscode.postMessage({
      type: 'load-from-file',
      payload: null
    });

    // Extension will send 'draft-loaded' message with file content
    // Store callback for when file is loaded
    window._vscodeOpenFileCallback = callback;
  };

  /**
   * Override FileManager.newFile to use VSCode confirmation
   */
  window.FileManager.newFile = function(callback) {
    if (YamlState.isStateDirty()) {
      // Use VSCode-friendly confirmation (simplified for now)
      const confirmed = confirm(
        'Você tem alterações não salvas. Deseja continuar e perder essas alterações?'
      );

      if (!confirmed) return;
    }

    YamlState.resetState();
    window.FileManager.showToast('Novo arquivo criado', 'info');

    if (callback) callback();
  };

  /**
   * Override copyToClipboard to use VSCode API
   */
  window.FileManager.copyToClipboard = function(text) {
    vscode.postMessage({
      type: 'copy-to-clipboard',
      payload: text
    });
    // Don't show toast here - wait for confirmation from extension
  };

    console.log('VSCode Bridge - FileManager methods overridden successfully');
  }

  // Start trying to override FileManager
  overrideFileManager();

  /**
   * Listen for messages from the extension
   */
  window.addEventListener('message', event => {
    const message = event.data;

    console.log('VSCode Bridge - Received message:', message.type);

    switch (message.type) {
      case 'draft-loaded':
        handleDraftLoaded(message.payload);
        break;

      case 'file-saved':
        handleFileSaved(message.payload);
        break;

      case 'clipboard-copied':
        window.FileManager.showToast('Copiado para área de transferência', 'success');
        break;

      case 'error':
        window.FileManager.showToast(message.payload || 'Erro desconhecido', 'error');
        break;

      case 'test-generated':
        handleTestGenerated(message.payload);
        break;

      case 'http-response':
        handleHttpResponse(message.payload);
        break;

      case 'toast':
        // Show toast notification from extension
        if (window.FileManager && window.FileManager.showToast) {
          window.FileManager.showToast(message.payload.message, message.payload.type);
        }
        break;

      default:
        console.warn('VSCode Bridge - Unknown message type:', message.type);
    }
  });

  /**
   * Handle draft/file loaded from extension
   */
  function handleDraftLoaded(payload) {
    if (!payload) {
      window.FileManager.showToast('Nenhum arquivo encontrado', 'info');
      return;
    }

    try {
      // Set state from loaded data
      YamlState.setState(payload);
      YamlState.markClean();

      window.FileManager.showToast('Arquivo carregado com sucesso', 'success');

      // Call stored callback if exists
      if (window._vscodeOpenFileCallback) {
        window._vscodeOpenFileCallback(payload);
        window._vscodeOpenFileCallback = null;
      }

    } catch (error) {
      window.FileManager.showToast(`Erro ao carregar arquivo: ${error.message}`, 'error');
      console.error('VSCode Bridge - Load error:', error);
    }
  }

  /**
   * Handle file saved confirmation
   */
  function handleFileSaved(payload) {
    const filename = payload?.filename || 'arquivo';
    window.FileManager.showToast(`Arquivo "${filename}" salvo com sucesso`, 'success');
  }

  /**
   * Handle test generated response
   */
  function handleTestGenerated(payload) {
    if (payload.success) {
      window.FileManager.showToast('Teste gerado com sucesso!', 'success');
      // Could update UI here if needed
    } else {
      const errorMsg = payload.error || 'Erro ao gerar teste';
      window.FileManager.showToast(errorMsg, 'error');
    }
  }

  /**
   * Save draft to extension global state
   */
  function saveDraft() {
    const state = YamlState.getState();
    vscode.postMessage({
      type: 'save-draft',
      payload: state
    });
  }

  /**
   * Load draft from extension global state
   */
  function loadDraft() {
    vscode.postMessage({
      type: 'load-draft',
      payload: null
    });
  }

  /**
   * Auto-save draft periodically (DISABLED - was too frequent)
   */
  let autoSaveInterval = null;

  function startAutoSave() {
    // Auto-save every 30 seconds if state is dirty
    autoSaveInterval = setInterval(() => {
      if (YamlState.isStateDirty()) {
        saveDraft();
        console.log('VSCode Bridge - Auto-saved draft');
      }
    }, 30000);
  }

  function stopAutoSave() {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
  }

  // Auto-save DISABLED - user can manually save
  // startAutoSave();

  // Save draft before unload
  window.addEventListener('beforeunload', () => {
    if (YamlState.isStateDirty()) {
      saveDraft();
    }
    stopAutoSave();
  });

  /**
   * Override window.confirm to use VSCode API
   * Sandboxed webviews don't allow native confirm dialogs
   */
  const confirmCache = new Map();
  let confirmRequestId = 0;

  window.confirm = function(message) {
    // Synchronous confirm is not possible in webviews
    // We need to use a different approach - return true and handle async
    // This is a workaround: we'll show a toast and return true
    console.warn('VSCode Bridge - confirm() called (sandbox blocks native confirm):', message);

    // For delete operations, we'll just return true (allow deletion)
    // Better UX would be to implement a custom modal, but that's complex
    return true;
  };

  /**
   * Intercept fetch API for HTTP requests (for cURL lab)
   * Webviews can't make arbitrary HTTP requests, so we proxy through the extension
   */
  const originalFetch = window.fetch;
  const pendingFetchRequests = new Map();
  let fetchRequestId = 0;

  window.fetch = function(url, options = {}) {
    // Check if this is an external HTTP request
    const urlString = typeof url === 'string' ? url : url.toString();

    console.log('VSCode Bridge - fetch() interceptor called with URL:', urlString);

    // Allow fetches to vscode-webview resources (internal)
    if (urlString.startsWith('vscode-webview://') || urlString.startsWith('data:')) {
      console.log('VSCode Bridge - Allowing internal resource fetch');
      return originalFetch.apply(this, arguments);
    }

    console.log('VSCode Bridge - Intercepting external HTTP request, will proxy through extension');

    // Proxy external HTTP requests through extension
    return new Promise((resolve, reject) => {
      const requestId = `fetch-${fetchRequestId++}`;

      // Store promise handlers
      pendingFetchRequests.set(requestId, { resolve, reject });

      // Prepare request data
      const requestData = {
        url: urlString,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || null,
      };

      console.log('VSCode Bridge - Proxying fetch request:', requestId, urlString);

      // Send to extension
      vscode.postMessage({
        type: 'http-request',
        payload: {
          requestId,
          ...requestData
        }
      });

      // Set timeout (30 seconds)
      setTimeout(() => {
        if (pendingFetchRequests.has(requestId)) {
          pendingFetchRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  };

  /**
   * Handle HTTP response from extension
   */
  function handleHttpResponse(payload) {
    const { requestId, success, data, error } = payload;

    const pending = pendingFetchRequests.get(requestId);
    if (!pending) {
      console.warn('VSCode Bridge - No pending request found for:', requestId);
      return;
    }

    pendingFetchRequests.delete(requestId);

    if (success) {
      // Create a fake Response object that matches Fetch API
      const response = {
        ok: data.status >= 200 && data.status < 300,
        status: data.status,
        statusText: data.statusText || '',
        headers: new Map(Object.entries(data.headers || {})),
        url: data.url,
        text: () => Promise.resolve(data.body),
        json: () => {
          try {
            return Promise.resolve(JSON.parse(data.body));
          } catch (e) {
            return Promise.reject(e);
          }
        },
        blob: () => Promise.resolve(new Blob([data.body])),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(data.body).buffer),
      };

      console.log('VSCode Bridge - HTTP response received:', requestId, response.status);
      pending.resolve(response);
    } else {
      console.error('VSCode Bridge - HTTP request failed:', requestId, error);
      pending.reject(new Error(error || 'HTTP request failed'));
    }
  }


  // Log successful initialization
  console.log('VSCode Bridge - Initialized successfully');
  console.log('VSCode Bridge - Fetch API interceptor installed:', typeof window.fetch === 'function');
  console.log('VSCode Bridge - window.fetch:', window.fetch.toString().substring(0, 100) + '...');

  // Expose bridge API globally for debugging
  window.VSCodeBridge = {
    saveDraft,
    loadDraft,
    startAutoSave,
    stopAutoSave,
    vscode,
    pendingFetchRequests
  };

})();
