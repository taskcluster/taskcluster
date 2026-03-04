/**
 * Shared helper functions and constants for API example generators
 */

/**
 * Standard placeholder values for consistent examples
 */
export const PLACEHOLDERS = {
  rootUrl: 'https://tc.example.com',
  clientId: 'your-client-id',
  accessToken: 'your-access-token',
  taskId: 'dSlITZ4yQgmvxxAi4A8fHQ',
  taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
  runId: '0',
  workerGroup: 'my-worker-group',
  workerId: 'my-worker',
  workerPoolId: 'my-worker-pool',
  workerType: 'my-worker-type',
  provisionerId: 'my-provisioner',
  artifactName: 'public/build/target.tar.gz',
  hookGroupId: 'project-taskcluster',
  hookId: 'smoketest',
  namespace: 'garbage.test-artifacts',
  cacheName: 'my-cache',
  roleId: 'repo:github.com/taskcluster/*',
  clientScopes: ['queue:create-task:*'],
  secretName: 'project/taskcluster/test',
  continuationToken: 'continuationToken',
  limit: '1000',
};

/**
 * Map parameter names to appropriate placeholder values
 *
 * @param {string} paramName - Parameter name from API definition
 * @returns {string} Appropriate placeholder value
 */
export function getPlaceholderValue(paramName) {
  // Direct mappings
  if (PLACEHOLDERS[paramName]) {
    return PLACEHOLDERS[paramName];
  }

  // Pattern-based mappings
  if (paramName.endsWith('Id')) {
    // For IDs that aren't in our mapping, use the standard taskId placeholder
    return PLACEHOLDERS.taskId;
  }

  if (paramName.includes('Name')) {
    return `my-${paramName.replace('Name', '').toLowerCase()}`;
  }

  if (paramName === 'limit') {
    return '1000';
  }

  if (paramName === 'continuationToken') {
    return 'continuationTokenHere';
  }

  // Default: use parameter name wrapped in angle brackets
  return `<${paramName}>`;
}

/**
 * Determine if an API call requires authentication based on scopes
 *
 * @param {object} entry - API entry metadata
 * @returns {boolean} True if authentication is required
 */
export function requiresAuth(entry) {
  // Check if scopes are required (scopes can be null, undefined, or absent)
  return entry.scopes !== null && entry.scopes !== undefined;
}

/**
 * Capitalize the first letter of a string
 *
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export function capitalize(str) {
  if (!str) {
    return '';
  }

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert string to camelCase
 *
 * @param {string} str - String to convert
 * @returns {string} camelCase string
 */
export function camelCase(str) {
  if (!str) {
    return '';
  }

  // Handle snake_case
  if (str.includes('_')) {
    return str
      .split('_')
      .map((part, i) => (i === 0 ? part : capitalize(part)))
      .join('');
  }

  // Handle kebab-case
  if (str.includes('-')) {
    return str
      .split('-')
      .map((part, i) => (i === 0 ? part : capitalize(part)))
      .join('');
  }

  // Already camelCase or single word
  return str;
}

/**
 * Generate a placeholder payload object with helpful comments
 *
 * @param {string} serviceName - Service name
 * @param {string} schemaRef - Schema reference
 * @param {string} rootUrl - Taskcluster root URL
 * @returns {string} JSON string with placeholder payload
 */
export function generatePlaceholderPayload(
  serviceName,
  schemaRef,
  rootUrl = PLACEHOLDERS.rootUrl
) {
  const schemaUrl = `${rootUrl}/schemas/${serviceName}/${schemaRef}`;

  return `{
  // TODO: Fill in request fields
  // See schema: ${schemaUrl}
  // Required fields depend on the schema - consult the documentation
}`;
}

/**
 * Format a payload object as JSON string with proper indentation
 *
 * @param {object} payload - Payload object to format
 * @param {number} baseIndent - Base indentation level (number of spaces)
 * @returns {string} Formatted JSON string
 */
export function formatPayloadJson(payload, baseIndent = 0) {
  if (!payload || typeof payload !== 'object') {
    return '{}';
  }

  const indentStr = ' '.repeat(baseIndent);
  const json = JSON.stringify(payload, null, 2);
  // Add base indentation to all lines except the first
  const lines = json.split('\n');

  return lines
    .map((line, index) => (index === 0 ? line : indentStr + line))
    .join('\n');
}
