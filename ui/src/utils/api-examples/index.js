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

// References for schema lookup, available after `yarn generate`.
const referenceModules = import.meta.glob(
  '../../../../generated/references.json',
  { eager: true }
);
const references = Object.values(referenceModules)[0]?.default ?? [];

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
 * @returns {string|null} Code example or null if not found
 */
function generateSingleExample(language, serviceName, apiVersion, entry) {
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
    go: () => generateGoExample(serviceName, entry, payloadExample),
    python: () =>
      generatePythonExample(serviceName, entry, false, payloadExample),
    pythonAsync: () =>
      generatePythonExample(serviceName, entry, true, payloadExample),
    node: () => generateNodeExample(serviceName, entry, payloadExample),
    web: () => generateWebExample(serviceName, entry, payloadExample),
    rust: () => generateRustExample(serviceName, entry, payloadExample),
    shell: () => generateShellExample(serviceName, entry, payloadExample),
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
 * @returns {object|string|null} Examples object or string or null
 */
export default function generateExamples(
  serviceName,
  apiVersion,
  entry,
  language = null
) {
  // Only generate examples for function entries (not exchanges, logs, etc.)
  if (entry.type !== 'function') {
    return null;
  }

  // If a specific language is requested, generate only that one (lazy loading)
  if (language) {
    return generateSingleExample(language, serviceName, apiVersion, entry);
  }

  // Generate all examples
  const examples = {
    curl: generateSingleExample('curl', serviceName, apiVersion, entry),
    go: generateSingleExample('go', serviceName, apiVersion, entry),
    python: generateSingleExample('python', serviceName, apiVersion, entry),
    pythonAsync: generateSingleExample(
      'pythonAsync',
      serviceName,
      apiVersion,
      entry
    ),
    node: generateSingleExample('node', serviceName, apiVersion, entry),
    web: generateSingleExample('web', serviceName, apiVersion, entry),
    rust: generateSingleExample('rust', serviceName, apiVersion, entry),
    shell: generateSingleExample('shell', serviceName, apiVersion, entry),
  };

  return examples;
}
