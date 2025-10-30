/**
 * app.js - Main application orchestrator
 *
 * Initializes all modules, manages navigation, and coordinates interactions.
 */

(function() {
  'use strict';

  let currentSection = 'suite-config';
  let previewUpdateTimeout = null;

  /**
   * Initialize the application
   */
  function init() {
    console.log('Flow Test YAML Generator - Initializing...');

    // Subscribe to state changes for preview updates
    YamlState.subscribe(updatePreview);

    // Setup navigation
    setupNavigation();

    // Setup header buttons
    setupHeaderButtons();

    // Setup preview controls
    setupPreviewControls();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Setup mobile sidebar toggle
    setupMobileSidebar();

    // Render initial section
    navigateTo('suite-config');

    // Update preview
    updatePreview();

    console.log('Application initialized successfully');
  }

  /**
   * Setup navigation menu
   */
  function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-section], .nav-subitem[data-section]');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = e.currentTarget.dataset.section;
        navigateTo(section);

        // Close mobile sidebar after navigation
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
        }
      });
    });
  }

  /**
   * Navigate to a specific section
   * @param {string} section - Section identifier
   * @param {Object} options - Additional options
   */
  function navigateTo(section, options = {}) {
    currentSection = section;

    // Update active nav item
    document.querySelectorAll('.nav-item, .nav-subitem').forEach(item => {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    });

    const activeItem = document.querySelector(`[data-section="${section}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
      activeItem.setAttribute('aria-current', 'page');
    }

    // Render section
    const container = document.getElementById('form-container');
    if (container) {
      const html = FormRenderer.renderSection(section, options);
      container.innerHTML = html;

      // Attach event listeners
      FormRenderer.attachEventListeners(section);

      // Scroll to top
      container.scrollTop = 0;
    }
  }

  /**
   * Setup header action buttons
   */
  function setupHeaderButtons() {
    const newBtn = document.getElementById('btn-new');
    const openBtn = document.getElementById('btn-open');
    const saveBtn = document.getElementById('btn-save');
    const runBtn = document.getElementById('btn-run-test');

    if (newBtn) {
      newBtn.addEventListener('click', () => {
        FileManager.newFile(() => {
          navigateTo('suite-config');
        });
      });
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        // In VSCode, FileManager.openFile is overridden by vscode-bridge.js
        // to use VSCode's file picker dialog
        FileManager.openFile(null, (data) => {
          navigateTo('suite-config');
        });
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        FileManager.saveFile();
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        runTest();
      });
    }
  }

  /**
   * Execute the current test
   */
  function runTest() {
    try {
      const state = YamlState.getState();
      const validation = YamlState.validateState();

      if (!validation.valid) {
        const errorMsg = validation.errors.join('\n');
        FileManager.showToast(`Não é possível executar. Erros:\n${errorMsg}`, 'error');
        return;
      }

      // Send message to extension to run the test
      if (window.VSCodeBridge && window.VSCodeBridge.vscode) {
        window.VSCodeBridge.vscode.postMessage({
          type: 'run-test',
          payload: state
        });

        FileManager.showToast('Executando teste...', 'info');
      } else {
        FileManager.showToast('Erro: VSCode API não disponível', 'error');
      }
    } catch (error) {
      FileManager.showToast(`Erro ao executar teste: ${error.message}`, 'error');
      console.error('Run test error:', error);
    }
  }

  /**
   * Setup preview controls
   */
  function setupPreviewControls() {
    const toggleBtn = document.getElementById('btn-toggle-preview');
    const copyBtn = document.getElementById('btn-copy-yaml');
    const previewSidebar = document.getElementById('preview-sidebar');

    if (toggleBtn && previewSidebar) {
      toggleBtn.addEventListener('click', () => {
        previewSidebar.classList.toggle('collapsed');
        toggleBtn.textContent = previewSidebar.classList.contains('collapsed') ? '▶' : '◀';
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const yamlPreview = document.getElementById('yaml-preview');
        if (yamlPreview) {
          const text = yamlPreview.textContent;
          FileManager.copyToClipboard(text);
        }
      });
    }
  }

  /**
   * Update YAML preview (throttled)
   */
  function updatePreview() {
    // Clear existing timeout
    if (previewUpdateTimeout) {
      clearTimeout(previewUpdateTimeout);
    }

    // Throttle updates to avoid excessive rendering
    previewUpdateTimeout = setTimeout(() => {
      try {
        const state = YamlState.getState();
        const yaml = YamlSerializer.serializeSuite(state);

        const previewElement = document.getElementById('yaml-preview');
        if (previewElement) {
          previewElement.textContent = yaml || '# YAML vazio';
        }
      } catch (error) {
        console.error('Preview update error:', error);
        const previewElement = document.getElementById('yaml-preview');
        if (previewElement) {
          previewElement.textContent = `# Erro ao gerar preview:\n# ${error.message}`;
        }
      }
    }, 500);
  }

  /**
   * Setup keyboard shortcuts
   */
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+S / Cmd+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        FileManager.saveFile();
      }

      // Ctrl+O / Cmd+O: Open
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        // In VSCode, FileManager.openFile is overridden by vscode-bridge.js
        FileManager.openFile(null, (data) => {
          navigateTo('suite-config');
        });
      }

      // Ctrl+N / Cmd+N: New
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        FileManager.newFile();
      }
    });
  }

  /**
   * Setup mobile sidebar toggle
   */
  function setupMobileSidebar() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });

      // Close sidebar when clicking outside
      document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            !toggleBtn.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }
  }

  /**
   * Warn user about unsaved changes before leaving
   */
  function setupUnloadWarning() {
    window.addEventListener('beforeunload', (e) => {
      if (YamlState.isStateDirty()) {
        e.preventDefault();
        e.returnValue = 'Você tem alterações não salvas. Deseja realmente sair?';
        return e.returnValue;
      }
    });
  }

  // Setup unload warning
  setupUnloadWarning();

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export App object globally for access from other modules
  window.App = {
    navigateTo,
    init
  };

})();
