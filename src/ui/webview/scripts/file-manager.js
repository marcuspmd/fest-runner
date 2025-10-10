/**
 * file-manager.js - File operations module
 *
 * Handles new, open, and save file operations using browser APIs.
 */

const FileManager = (function() {
  'use strict';

  let currentFileName = 'test-suite.yaml';

  /**
   * Create a new empty file
   * @param {Function} callback - Optional callback after confirmation
   */
  function newFile(callback) {
    if (YamlState.isStateDirty()) {
      const confirmed = window.confirm(
        'Você tem alterações não salvas. Deseja continuar e perder essas alterações?'
      );

      if (!confirmed) return;
    }

    YamlState.resetState();
    currentFileName = 'test-suite.yaml';
    showToast('Novo arquivo criado', 'info');

    if (callback) callback();
  }

  /**
   * Open a file from user's filesystem
   * @param {HTMLInputElement} fileInput - File input element
   * @param {Function} callback - Callback with loaded data
   */
  function openFile(fileInput, callback) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showToast('Nenhum arquivo selecionado', 'error');
      return;
    }

    const file = fileInput.files[0];
    currentFileName = file.name;

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const yamlContent = e.target.result;
        const parsed = YamlSerializer.parse(yamlContent);

        // Validate parsed data
        const validation = Validator.validateTestSuite(parsed);
        if (!validation.valid) {
          const errorMsg = validation.errors.map(e => e.message).join('\n');
          showToast(`Arquivo inválido:\n${errorMsg}`, 'error');
          return;
        }

        YamlState.setState(parsed);
        YamlState.markClean();
        showToast(`Arquivo "${currentFileName}" carregado com sucesso`, 'success');

        if (callback) callback(parsed);

      } catch (error) {
        showToast(`Erro ao abrir arquivo: ${error.message}`, 'error');
        console.error('File open error:', error);
      }
    };

    reader.onerror = function() {
      showToast('Erro ao ler arquivo', 'error');
    };

    reader.readAsText(file);
  }

  /**
   * Save current state as YAML file
   * @param {string} filename - Optional custom filename
   */
  function saveFile(filename = null) {
    try {
      // Validate state before saving
      const validation = YamlState.validateState();
      if (!validation.valid) {
        const errorMsg = validation.errors.join('\n');
        showToast(`Não é possível salvar. Erros:\n${errorMsg}`, 'error');
        return;
      }

      const state = YamlState.getState();
      const yamlContent = YamlSerializer.serializeSuite(state);

      // Determine filename
      const saveFileName = filename || currentFileName || generateFileName(state);

      // Create blob and download
      const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = saveFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      YamlState.markClean();
      currentFileName = saveFileName;
      showToast(`Arquivo "${saveFileName}" salvo com sucesso`, 'success');

    } catch (error) {
      showToast(`Erro ao salvar arquivo: ${error.message}`, 'error');
      console.error('File save error:', error);
    }
  }

  /**
   * Generate filename from suite properties
   * @param {Object} suite - Suite object
   * @returns {string} Generated filename
   */
  function generateFileName(suite) {
    const nodeId = suite.node_id || 'test-suite';
    return `${nodeId}.yaml`;
  }

  /**
   * Get current filename
   * @returns {string}
   */
  function getCurrentFileName() {
    return currentFileName;
  }

  /**
   * Show toast notification
   * @param {string} message - Message to show
   * @param {string} type - Type: success, error, info
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentElement) {
          container.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Copiado para área de transferência', 'success'))
        .catch(() => showToast('Erro ao copiar', 'error'));
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        showToast('Copiado para área de transferência', 'success');
      } catch (error) {
        showToast('Erro ao copiar', 'error');
      }

      document.body.removeChild(textarea);
    }
  }

  // Public API
  return {
    newFile,
    openFile,
    saveFile,
    getCurrentFileName,
    showToast,
    copyToClipboard
  };
})();

// Make available globally
window.FileManager = FileManager;
