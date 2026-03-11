/**
 * Generate taskcluster-cli (shell client) examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  camelCase,
  formatPayloadJson,
} from './helpers';

/**
 * Generate a taskcluster-cli example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} taskcluster-cli command example
 */
export default function generateShellExample(
  serviceName,
  apiVersion,
  entry,
  payloadExample = null
) {
  const methodName = camelCase(entry.name);
  // Build header comment
  const header = requiresAuth(entry)
    ? `# ${entry.title}
# This endpoint requires authentication
# Set your credentials in environment variables:
#   TASKCLUSTER_ROOT_URL=https://tc.example.com
#   TASKCLUSTER_CLIENT_ID=your-client-id
#   TASKCLUSTER_ACCESS_TOKEN=your-access-token`
    : `# ${entry.title}
# No authentication required
# Set TASKCLUSTER_ROOT_URL=${PLACEHOLDERS.rootUrl}`;
  // Build base command
  let command = `taskcluster api ${serviceName} ${methodName}`;

  // Add path parameters
  entry.args.forEach(arg => {
    const placeholder = getPlaceholderValue(arg);

    command += ` --${arg} "${placeholder}"`;
  });

  // Add query parameters if present
  if (entry.query && entry.query.length > 0) {
    entry.query.forEach(q => {
      command += ` \\\n  --${q} "<${q}>"`;
    });
  }

  // Add request body for methods that have one
  if (entry.input) {
    let inputPayload = '{\n  "key": "value"\n}';

    if (payloadExample) {
      inputPayload = formatPayloadJson(payloadExample, 0);
    }

    command += ` \\\n  --input - <<'EOF'\n${inputPayload}\nEOF`;
  }

  // Build output formatting hint
  const outputHint =
    entry.output && entry.output !== 'blob'
      ? `\n\n# To format output as JSON:
# ${command.split('\n')[0]} | jq .`
      : '';
  // Assemble the complete example
  const example = `${header}

${command}${outputHint}`;

  return example;
}
