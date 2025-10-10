/**
 * yaml-serializer.js - YAML serialization and parsing module
 *
 * Converts JavaScript objects to YAML strings and vice-versa.
 * Uses js-yaml library for parsing, implements custom serialization.
 */

const YamlSerializer = (function() {
  'use strict';

  /**
   * Serialize JavaScript object to YAML string
   * @param {Object} obj - Object to serialize
   * @param {number} indent - Starting indentation level
   * @returns {string} YAML string
   */
  function serialize(obj, indent = 0) {
    if (obj === null || obj === undefined) {
      return 'null';
    }

    // Use js-yaml library if available (loaded via CDN)
    if (window.jsyaml && window.jsyaml.dump) {
      try {
        return window.jsyaml.dump(obj, {
          indent: 2,
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
          quotingType: '"',
          forceQuotes: false
        });
      } catch (error) {
        console.error('js-yaml serialization error:', error);
        // Fallback to custom serialization
        return customSerialize(obj, indent);
      }
    }

    // Fallback to custom serialization
    return customSerialize(obj, indent);
  }

  /**
   * Custom YAML serialization implementation
   * @param {*} value - Value to serialize
   * @param {number} indent - Current indentation level
   * @returns {string}
   */
  function customSerialize(value, indent = 0) {
    const indentStr = '  '.repeat(indent);

    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      return serializeString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return serializeArray(value, indent);
    }

    if (typeof value === 'object') {
      return serializeObject(value, indent);
    }

    return String(value);
  }

  /**
   * Serialize string with proper quoting and escaping
   * @param {string} str - String to serialize
   * @returns {string}
   */
  function serializeString(str) {
    // Check if string needs quoting
    const needsQuotes = /[:#\{\}\[\]!*&|>@`]/.test(str) ||
                       /^\s|\s$/.test(str) ||
                       /^[0-9]/.test(str) ||
                       str === '' ||
                       ['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(str.toLowerCase());

    if (needsQuotes) {
      // Use double quotes and escape special characters
      return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }

    // Check for multiline
    if (str.includes('\n')) {
      return '|\n' + str.split('\n').map(line => '  ' + line).join('\n');
    }

    return str;
  }

  /**
   * Serialize array
   * @param {Array} arr - Array to serialize
   * @param {number} indent - Current indentation
   * @returns {string}
   */
  function serializeArray(arr, indent) {
    if (arr.length === 0) {
      return '[]';
    }

    const indentStr = '  '.repeat(indent);
    const lines = arr.map(item => {
      if (typeof item === 'object' && !Array.isArray(item)) {
        const objStr = customSerialize(item, indent + 1);
        return indentStr + '- ' + objStr.trim().split('\n').map((line, i) => {
          return i === 0 ? line : indentStr + '  ' + line;
        }).join('\n');
      } else {
        return indentStr + '- ' + customSerialize(item, indent + 1);
      }
    });

    return '\n' + lines.join('\n');
  }

  /**
   * Serialize object
   * @param {Object} obj - Object to serialize
   * @param {number} indent - Current indentation
   * @returns {string}
   */
  function serializeObject(obj, indent) {
    if (Object.keys(obj).length === 0) {
      return '{}';
    }

    const indentStr = '  '.repeat(indent);
    const nextIndentStr = '  '.repeat(indent + 1);

    const lines = Object.entries(obj)
      .filter(([key, value]) => value !== undefined)
      .map(([key, value]) => {
        const serializedValue = customSerialize(value, indent + 1);

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return indentStr + key + ':\n' +
                 Object.entries(value).map(([k, v]) => {
                   return nextIndentStr + k + ': ' + customSerialize(v, indent + 2);
                 }).join('\n');
        } else if (Array.isArray(value) && value.length > 0) {
          return indentStr + key + ':' + serializeArray(value, indent + 1);
        } else {
          return indentStr + key + ': ' + serializedValue;
        }
      });

    return lines.join('\n');
  }

  /**
   * Parse YAML string to JavaScript object
   * @param {string} yamlString - YAML string to parse
   * @returns {Object} Parsed object
   * @throws {Error} If parsing fails
   */
  function parse(yamlString) {
    if (!yamlString || yamlString.trim() === '') {
      throw new Error('YAML string is empty');
    }

    // Use js-yaml library if available
    if (window.jsyaml && window.jsyaml.load) {
      try {
        return window.jsyaml.load(yamlString);
      } catch (error) {
        throw new Error(`YAML parse error: ${error.message}`);
      }
    }

    throw new Error('js-yaml library not loaded. Cannot parse YAML.');
  }

  /**
   * Validate YAML syntax
   * @param {string} yamlString - YAML string to validate
   * @returns {Object} { valid: boolean, error: string|null }
   */
  function validate(yamlString) {
    try {
      parse(yamlString);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Format TestSuite object for better YAML output
   * Removes empty/null fields, orders properties logically
   * @param {Object} suite - TestSuite object
   * @returns {Object} Cleaned suite object
   */
  function cleanSuite(suite) {
    const cleaned = {};

    // Required fields first
    cleaned.node_id = suite.node_id || '';
    cleaned.suite_name = suite.suite_name || '';

    // Optional description
    if (suite.description && suite.description.trim()) {
      cleaned.description = suite.description;
    }

    // Base URL
    if (suite.base_url && suite.base_url.trim()) {
      cleaned.base_url = suite.base_url;
    }

    // Execution mode (only if not default)
    if (suite.execution_mode && suite.execution_mode !== 'sequential') {
      cleaned.execution_mode = suite.execution_mode;
    }

    // Metadata
    if (suite.metadata && Object.keys(suite.metadata).length > 0) {
      cleaned.metadata = cleanObject(suite.metadata);
    }

    // Variables
    if (suite.variables && Object.keys(suite.variables).length > 0) {
      cleaned.variables = suite.variables;
    }

    // Exports
    if (suite.exports && suite.exports.length > 0) {
      cleaned.exports = suite.exports;
    }

    if (suite.exports_optional && suite.exports_optional.length > 0) {
      cleaned.exports_optional = suite.exports_optional;
    }

    // Dependencies
    if (suite.depends && suite.depends.length > 0) {
      cleaned.depends = suite.depends;
    }

    // Faker config
    if (suite.faker && (suite.faker.locale || suite.faker.seed !== undefined)) {
      cleaned.faker = cleanObject(suite.faker);
    }

    // Steps (required)
    if (suite.steps && suite.steps.length > 0) {
      cleaned.steps = suite.steps.map(cleanStep);
    } else {
      cleaned.steps = [];
    }

    return cleaned;
  }

  /**
   * Clean step object
   * @param {Object} step - Step object
   * @returns {Object} Cleaned step
   */
  function cleanStep(step) {
    const cleaned = {};

    cleaned.name = step.name || 'Unnamed Step';

    if (step.step_id) cleaned.step_id = step.step_id;
    if (step.request) cleaned.request = cleanObject(step.request);
    if (step.assert) cleaned.assert = cleanObject(step.assert);
    if (step.capture) cleaned.capture = step.capture;
    if (step.scenarios) cleaned.scenarios = step.scenarios;
    if (step.iterate) cleaned.iterate = step.iterate;
    if (step.input) cleaned.input = cleanObject(step.input);
    if (step.call) cleaned.call = cleanObject(step.call);
    if (step.continue_on_failure) cleaned.continue_on_failure = step.continue_on_failure;
    if (step.metadata) cleaned.metadata = cleanObject(step.metadata);

    return cleaned;
  }

  /**
   * Remove null/undefined/empty values from object
   * @param {Object} obj - Object to clean
   * @returns {Object} Cleaned object
   */
  function cleanObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const cleaned = {};

    Object.entries(obj).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (typeof value === 'string' && value.trim() === '') return;
      if (Array.isArray(value) && value.length === 0) return;
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return;

      cleaned[key] = value;
    });

    return cleaned;
  }

  /**
   * Serialize TestSuite to YAML with proper formatting
   * @param {Object} suite - TestSuite object
   * @returns {string} YAML string
   */
  function serializeSuite(suite) {
    const cleaned = cleanSuite(suite);
    return serialize(cleaned);
  }

  // Public API
  return {
    serialize,
    serializeSuite,
    parse,
    validate,
    cleanSuite
  };
})();

// Make available globally
window.YamlSerializer = YamlSerializer;
