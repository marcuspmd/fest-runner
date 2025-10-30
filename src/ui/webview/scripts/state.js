/**
 * state.js - State management module for YAML Generator
 *
 * Implements centralized state management with observer pattern.
 * Manages the TestSuite object in memory and notifies subscribers of changes.
 */

const YamlState = (function() {
  'use strict';

  /**
   * Initial empty state matching TestSuite interface
   */
  let state = {
    node_id: '',
    suite_name: '',
    description: '',
    base_url: '',
    execution_mode: 'sequential',
    variables: {},
    exports: [],
    exports_optional: [],
    depends: [],
    faker: null,
    metadata: {},
    steps: []
  };

  /**
   * List of subscriber functions to notify on state changes
   */
  const listeners = [];

  /**
   * Flag to track if state has been modified
   */
  let isDirty = false;

  /**
   * Get the current complete state
   * @returns {Object} Current state (immutable copy)
   */
  function getState() {
    return JSON.parse(JSON.stringify(state)); // Deep clone
  }

  /**
   * Replace the entire state
   * @param {Object} newState - New state object
   * @param {boolean} silent - If true, don't notify listeners
   */
  function setState(newState, silent = false) {
    state = JSON.parse(JSON.stringify(newState)); // Deep clone
    isDirty = true;

    if (!silent) {
      notifyListeners();
    }
  }

  /**
   * Update a specific field in the state using dot notation
   * @param {string} path - Path to field (e.g., "metadata.priority" or "steps[0].name")
   * @param {*} value - New value
   */
  function updateField(path, value) {
    setNestedValue(state, path, value);
    isDirty = true;
    notifyListeners();
  }

  /**
   * Get value from nested object using dot notation
   * @param {Object} obj - Object to query
   * @param {string} path - Path string (e.g., "user.profile.name")
   * @returns {*} Value at path or undefined
   */
  function getNestedValue(obj, path) {
    const keys = parsePath(path);
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Set value in nested object using dot notation
   * @param {Object} obj - Object to modify
   * @param {string} path - Path string (e.g., "user.profile.name")
   * @param {*} value - Value to set
   */
  function setNestedValue(obj, path, value) {
    const keys = parsePath(path);
    const lastKey = keys.pop();
    let current = obj;

    // Navigate to parent object
    for (const key of keys) {
      if (!(key in current)) {
        // Create intermediate objects/arrays
        const nextKey = keys[keys.indexOf(key) + 1];
        current[key] = isArrayIndex(nextKey) ? [] : {};
      }
      current = current[key];
    }

    // Set the value
    current[lastKey] = value;
  }

  /**
   * Parse path string into array of keys
   * Supports: "a.b.c", "a[0].b", "a.b[1]"
   * @param {string} path - Path string
   * @returns {Array<string|number>} Array of keys
   */
  function parsePath(path) {
    return path
      .replace(/\[(\d+)\]/g, '.$1') // Convert [0] to .0
      .split('.')
      .filter(key => key !== '')
      .map(key => isNaN(key) ? key : parseInt(key, 10));
  }

  /**
   * Check if key is an array index
   * @param {*} key - Key to check
   * @returns {boolean}
   */
  function isArrayIndex(key) {
    return typeof key === 'number' || (typeof key === 'string' && !isNaN(key));
  }

  /**
   * Add a new step to the steps array
   * @param {Object} step - Step object
   * @param {number} index - Optional index to insert at (default: end)
   */
  function addStep(step, index = null) {
    const newStep = {
      name: step.name || 'New Step',
      step_id: step.step_id || null,
      ...step
    };

    if (index !== null && index >= 0 && index < state.steps.length) {
      state.steps.splice(index, 0, newStep);
    } else {
      state.steps.push(newStep);
    }

    isDirty = true;
    notifyListeners();
  }

  /**
   * Update an existing step
   * @param {number} index - Step index
   * @param {Object} updates - Partial step object with updates
   */
  function updateStep(index, updates) {
    if (index >= 0 && index < state.steps.length) {
      state.steps[index] = {
        ...state.steps[index],
        ...updates
      };
      isDirty = true;
      notifyListeners();
    }
  }

  /**
   * Remove a step from the steps array
   * @param {number} index - Index of step to remove
   */
  function removeStep(index) {
    if (index >= 0 && index < state.steps.length) {
      state.steps.splice(index, 1);
      isDirty = true;
      notifyListeners();
    }
  }

  /**
   * Reorder steps (move step from one index to another)
   * @param {number} fromIndex - Current index
   * @param {number} toIndex - Target index
   */
  function moveStep(fromIndex, toIndex) {
    if (fromIndex >= 0 && fromIndex < state.steps.length &&
        toIndex >= 0 && toIndex < state.steps.length) {
      const [removed] = state.steps.splice(fromIndex, 1);
      state.steps.splice(toIndex, 0, removed);
      isDirty = true;
      notifyListeners();
    }
  }

  /**
   * Get a specific step by index
   * @param {number} index - Step index
   * @returns {Object|null} Step object or null
   */
  function getStep(index) {
    if (index >= 0 && index < state.steps.length) {
      return JSON.parse(JSON.stringify(state.steps[index]));
    }
    return null;
  }

  /**
   * Subscribe to state changes
   * @param {Function} listener - Callback function to call on state change
   * @returns {Function} Unsubscribe function
   */
  function subscribe(listener) {
    listeners.push(listener);

    // Return unsubscribe function
    return function unsubscribe() {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of state change
   */
  function notifyListeners() {
    const currentState = getState();
    listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  /**
   * Reset state to initial empty state
   * @param {boolean} silent - If true, don't notify listeners
   */
  function resetState(silent = false) {
    state = {
      node_id: '',
      suite_name: '',
      description: '',
      base_url: '',
      execution_mode: 'sequential',
      variables: {},
      exports: [],
      exports_optional: [],
      depends: [],
      faker: null,
      metadata: {},
      steps: []
    };

    isDirty = false;

    if (!silent) {
      notifyListeners();
    }
  }

  /**
   * Check if state has been modified
   * @returns {boolean}
   */
  function isStateDirty() {
    return isDirty;
  }

  /**
   * Mark state as clean (saved)
   */
  function markClean() {
    isDirty = false;
  }

  /**
   * Validate the current state
   * @returns {Object} Validation result { valid: boolean, errors: Array }
   */
  function validateState() {
    const errors = [];

    // Required fields
    if (!state.node_id || state.node_id.trim() === '') {
      errors.push('node_id é obrigatório');
    } else if (!/^[a-z0-9-]+$/.test(state.node_id)) {
      errors.push('node_id deve conter apenas letras minúsculas, números e hífens');
    }

    if (!state.suite_name || state.suite_name.trim() === '') {
      errors.push('suite_name é obrigatório');
    }

    // Validate steps
    if (state.steps.length === 0) {
      errors.push('Pelo menos um step é necessário');
    }

    state.steps.forEach((step, index) => {
      if (!step.name || step.name.trim() === '') {
        errors.push(`Step ${index + 1}: nome é obrigatório`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Public API
  return {
    getState,
    setState,
    updateField,
    getNestedValue,
    addStep,
    updateStep,
    removeStep,
    moveStep,
    getStep,
    subscribe,
    resetState,
    isStateDirty,
    markClean,
    validateState
  };
})();

// Make available globally
window.YamlState = YamlState;
