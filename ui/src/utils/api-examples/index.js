/**
 * Generate code examples for API endpoints (client-side)
 *
 * This module generates code examples dynamically in the browser from
 * API metadata.
 */

import generateCurlExample from './curl';
import generateGoExample from './go';
import generateNodeExample from './node';
import generatePythonExample from './python';
import generateWebExample from './web';
import generateRustExample from './rust';
import generateShellExample from './shell';
import generatePayloadExample from './payload-generator';

// Default version - should match the current Taskcluster version
const DEFAULT_VERSION = '93';
// Import references for schema lookup
let references = [];

try {
  // Try to import references - will be available after yarn generate
  // eslint-disable-next-line global-require
  references = require('../../../../generated/references.json');
} catch (e) {
  // References not available - examples will use placeholder payloads
}

/**
 * Get schema content by ID
 *
 * @param {string} schemaId - Schema ID
 * @returns {object|null} Schema content or null if not found
 */
function getSchemaContent(schemaId) {
  if (!references || references.length === 0) {
    return null;
  }

  const schema = references.find(({ content }) => content.$id === schemaId);

  return schema ? schema.content : null;
}

/**
 * Generate a single code example for a specific language
 *
 * @param {string} language - Language key (e.g., 'go', 'python', 'curl')
 * @param {string} serviceName - Service name (e.g., 'queue', 'auth')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata from references.json
 * @param {string} version - Taskcluster version (e.g., '93')
 * @returns {string|null} Code example or null if not found
 */
function generateSingleExample(
  language,
  serviceName,
  apiVersion,
  entry,
  version = DEFAULT_VERSION
) {
  // Generate payload example if entry has input schema
  let payloadExample = null;

  if (entry.input) {
    const schemaId = `/schemas/${serviceName}/${entry.input}`;
    const schema = getSchemaContent(schemaId);

    if (schema) {
      // Pass all references for $ref resolution
      payloadExample = generatePayloadExample(schema, references);
    }
  }

  const generators = {
    curl: () =>
      generateCurlExample(serviceName, apiVersion, entry, payloadExample),
    go: () =>
      generateGoExample(
        serviceName,
        apiVersion,
        entry,
        version,
        payloadExample
      ),
    python: () =>
      generatePythonExample(
        serviceName,
        apiVersion,
        entry,
        false,
        payloadExample
      ),
    pythonAsync: () =>
      generatePythonExample(
        serviceName,
        apiVersion,
        entry,
        true,
        payloadExample
      ),
    node: () =>
      generateNodeExample(serviceName, apiVersion, entry, payloadExample),
    web: () =>
      generateWebExample(serviceName, apiVersion, entry, payloadExample),
    rust: () =>
      generateRustExample(serviceName, apiVersion, entry, payloadExample),
    shell: () =>
      generateShellExample(serviceName, apiVersion, entry, payloadExample),
  };
  const generator = generators[language];

  if (!generator) {
    throw new Error(`Unknown language requested: ${language}`);
  }

  return generator();
}

/**
 * Generate code examples for an API entry
 *
 * @param {string} serviceName - Service name
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {string} [language] - Optional language to generate
 * @param {string} [version] - Optional Taskcluster version
 * @returns {object|string|null} Examples object or string or null
 */
export default function generateExamples(
  serviceName,
  apiVersion,
  entry,
  language = null,
  version = DEFAULT_VERSION
) {
  // Only generate examples for function entries (not exchanges, logs, etc.)
  if (entry.type !== 'function') {
    return null;
  }

  // If a specific language is requested, generate only that one (lazy loading)
  if (language) {
    return generateSingleExample(
      language,
      serviceName,
      apiVersion,
      entry,
      version
    );
  }

  // Generate all examples
  const examples = {
    curl: generateSingleExample(
      'curl',
      serviceName,
      apiVersion,
      entry,
      version
    ),
    go: generateSingleExample('go', serviceName, apiVersion, entry, version),
    python: generateSingleExample(
      'python',
      serviceName,
      apiVersion,
      entry,
      version
    ),
    pythonAsync: generateSingleExample(
      'pythonAsync',
      serviceName,
      apiVersion,
      entry,
      version
    ),
    node: generateSingleExample(
      'node',
      serviceName,
      apiVersion,
      entry,
      version
    ),
    web: generateSingleExample('web', serviceName, apiVersion, entry, version),
    rust: generateSingleExample(
      'rust',
      serviceName,
      apiVersion,
      entry,
      version
    ),
    shell: generateSingleExample(
      'shell',
      serviceName,
      apiVersion,
      entry,
      version
    ),
  };

  return examples;
}
