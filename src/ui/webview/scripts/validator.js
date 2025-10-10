/**
 * validator.js - Validation module for form fields
 *
 * Provides validation functions for different field types and
 * real-time validation with visual feedback.
 */

const Validator = (function() {
  'use strict';

  /**
   * Email regex pattern
   */
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * URL regex pattern
   */
  const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

  /**
   * Kebab-case regex (for node_id)
   */
  const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /**
   * Validate a single field value
   * @param {*} value - Value to validate
   * @param {Object} rules - Validation rules
   * @returns {Object} { valid: boolean, message: string }
   */
  function validateField(value, rules = {}) {
    // Required check
    if (rules.required && isEmpty(value)) {
      return {
        valid: false,
        message: rules.requiredMessage || 'Este campo é obrigatório'
      };
    }

    // Skip other validations if value is empty and not required
    if (isEmpty(value) && !rules.required) {
      return { valid: true, message: '' };
    }

    // Type validation
    if (rules.type) {
      const typeCheck = validateType(value, rules.type);
      if (!typeCheck.valid) return typeCheck;
    }

    // Min length
    if (rules.minLength && value.length < rules.minLength) {
      return {
        valid: false,
        message: `Mínimo de ${rules.minLength} caracteres`
      };
    }

    // Max length
    if (rules.maxLength && value.length > rules.maxLength) {
      return {
        valid: false,
        message: `Máximo de ${rules.maxLength} caracteres`
      };
    }

    // Pattern (regex)
    if (rules.pattern) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        return {
          valid: false,
          message: rules.patternMessage || 'Formato inválido'
        };
      }
    }

    // Min value (for numbers)
    if (rules.min !== undefined && Number(value) < rules.min) {
      return {
        valid: false,
        message: `Valor mínimo: ${rules.min}`
      };
    }

    // Max value (for numbers)
    if (rules.max !== undefined && Number(value) > rules.max) {
      return {
        valid: false,
        message: `Valor máximo: ${rules.max}`
      };
    }

    // Custom validator function
    if (rules.custom && typeof rules.custom === 'function') {
      try {
        const result = rules.custom(value);
        if (result !== true) {
          return {
            valid: false,
            message: typeof result === 'string' ? result : 'Validação falhou'
          };
        }
      } catch (error) {
        return {
          valid: false,
          message: 'Erro na validação customizada'
        };
      }
    }

    return { valid: true, message: '' };
  }

  /**
   * Check if value is empty
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Validate type of value
   * @param {*} value - Value to validate
   * @param {string} expectedType - Expected type
   * @returns {Object} { valid: boolean, message: string }
   */
  function validateType(value, expectedType) {
    switch (expectedType) {
      case 'email':
        return isEmail(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Email inválido' };

      case 'url':
        return isUrl(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'URL inválida' };

      case 'number':
        return isNumber(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Deve ser um número' };

      case 'integer':
        return isInteger(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Deve ser um número inteiro' };

      case 'boolean':
        return typeof value === 'boolean'
          ? { valid: true, message: '' }
          : { valid: false, message: 'Deve ser verdadeiro ou falso' };

      case 'array':
        return Array.isArray(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Deve ser um array' };

      case 'object':
        return typeof value === 'object' && !Array.isArray(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Deve ser um objeto' };

      case 'kebab-case':
        return KEBAB_CASE_REGEX.test(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Use letras minúsculas, números e hífens' };

      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Check if value is a valid email
   * @param {string} value - Email to validate
   * @returns {boolean}
   */
  function isEmail(value) {
    return typeof value === 'string' && EMAIL_REGEX.test(value);
  }

  /**
   * Check if value is a valid URL
   * @param {string} value - URL to validate
   * @returns {boolean}
   */
  function isUrl(value) {
    return typeof value === 'string' && URL_REGEX.test(value);
  }

  /**
   * Check if value is a number
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  function isNumber(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }

  /**
   * Check if value is an integer
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  function isInteger(value) {
    return Number.isInteger(Number(value));
  }

  /**
   * Validate entire TestSuite object
   * @param {Object} suite - TestSuite object to validate
   * @returns {Object} { valid: boolean, errors: Array<{field, message}> }
   */
  function validateTestSuite(suite) {
    const errors = [];

    // Required fields
    if (!suite.node_id || suite.node_id.trim() === '') {
      errors.push({ field: 'node_id', message: 'node_id é obrigatório' });
    } else if (!KEBAB_CASE_REGEX.test(suite.node_id)) {
      errors.push({
        field: 'node_id',
        message: 'node_id deve usar kebab-case (ex: my-test-suite)'
      });
    }

    if (!suite.suite_name || suite.suite_name.trim() === '') {
      errors.push({ field: 'suite_name', message: 'suite_name é obrigatório' });
    }

    // Validate base_url if provided
    if (suite.base_url && suite.base_url.trim() !== '') {
      if (!isUrl(suite.base_url)) {
        errors.push({ field: 'base_url', message: 'base_url deve ser uma URL válida' });
      }
    }

    // Validate steps
    if (!suite.steps || suite.steps.length === 0) {
      errors.push({ field: 'steps', message: 'Pelo menos um step é necessário' });
    } else {
      suite.steps.forEach((step, index) => {
        if (!step.name || step.name.trim() === '') {
          errors.push({
            field: `steps[${index}].name`,
            message: `Step ${index + 1}: nome é obrigatório`
          });
        }

        // Validate step_id if provided
        if (step.step_id && !KEBAB_CASE_REGEX.test(step.step_id)) {
          errors.push({
            field: `steps[${index}].step_id`,
            message: `Step ${index + 1}: step_id deve usar kebab-case`
          });
        }

        // Validate request if present
        if (step.request) {
          if (!step.request.method) {
            errors.push({
              field: `steps[${index}].request.method`,
              message: `Step ${index + 1}: método HTTP é obrigatório`
            });
          }

          if (!step.request.url || step.request.url.trim() === '') {
            errors.push({
              field: `steps[${index}].request.url`,
              message: `Step ${index + 1}: URL é obrigatória`
            });
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply validation visual feedback to form field
   * @param {HTMLElement} inputElement - Input element
   * @param {Object} validation - Validation result
   */
  function applyFieldValidation(inputElement, validation) {
    if (!inputElement) return;

    // Remove existing validation classes
    inputElement.classList.remove('is-valid', 'is-invalid');

    // Remove existing error messages
    const existingError = inputElement.parentElement?.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }

    const existingSuccess = inputElement.parentElement?.querySelector('.success-message');
    if (existingSuccess) {
      existingSuccess.remove();
    }

    if (validation.valid) {
      inputElement.classList.add('is-valid');
      inputElement.setAttribute('aria-invalid', 'false');

      // Optionally show success message
      if (validation.showSuccess) {
        const successEl = document.createElement('div');
        successEl.className = 'success-message';
        successEl.textContent = validation.message || 'Válido';
        inputElement.parentElement.appendChild(successEl);
      }
    } else {
      inputElement.classList.add('is-invalid');
      inputElement.setAttribute('aria-invalid', 'true');

      // Show error message
      const errorEl = document.createElement('div');
      errorEl.className = 'error-message';
      errorEl.textContent = validation.message;
      errorEl.setAttribute('role', 'alert');
      inputElement.parentElement.appendChild(errorEl);
    }
  }

  /**
   * Create debounced validation function
   * @param {Function} validationFn - Validation function
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  function debounceValidation(validationFn, delay = 300) {
    let timeoutId;

    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        validationFn.apply(this, args);
      }, delay);
    };
  }

  /**
   * Attach real-time validation to input element
   * @param {HTMLElement} inputElement - Input element
   * @param {Object} rules - Validation rules
   * @param {Function} callback - Optional callback on validation
   */
  function attachLiveValidation(inputElement, rules, callback) {
    const debouncedValidate = debounceValidation((value) => {
      const validation = validateField(value, rules);
      applyFieldValidation(inputElement, validation);

      if (callback) {
        callback(validation);
      }
    }, 300);

    inputElement.addEventListener('input', (e) => {
      debouncedValidate(e.target.value);
    });

    inputElement.addEventListener('blur', (e) => {
      const validation = validateField(e.target.value, rules);
      applyFieldValidation(inputElement, validation);

      if (callback) {
        callback(validation);
      }
    });
  }

  // Public API
  return {
    validateField,
    validateTestSuite,
    applyFieldValidation,
    attachLiveValidation,
    debounceValidation,
    isEmpty,
    isEmail,
    isUrl,
    isNumber,
    isInteger
  };
})();

// Make available globally
window.Validator = Validator;
