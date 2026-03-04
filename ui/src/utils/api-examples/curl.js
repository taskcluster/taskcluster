/**
 * Generate curl command examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  formatPayloadJson,
} from './helpers';

/**
 * Generate a curl example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} curl command example
 */
export default function generateCurlExample(
  serviceName,
  apiVersion,
  entry,
  payloadExample = null
) {
  const { method, route, args, query, input } = entry;
  // Build the URL
  let url = `${PLACEHOLDERS.rootUrl}/api/${serviceName}/${apiVersion}${route}`;

  // Replace path parameters
  args.forEach(arg => {
    const placeholder = getPlaceholderValue(arg);

    url = url.replace(`<${arg}>`, placeholder);
  });

  // Add query parameters if present
  if (query && query.length > 0) {
    const queryParams = query.map(q => `${q}=<${q}>`).join('&');

    url += `?${queryParams}`;
  }

  // Build the command
  let example = `# ${entry.title}\n`;

  if (requiresAuth(entry)) {
    example += `# This endpoint requires authentication\n`;
    example += `# Set your credentials in environment variables:\n`;
    example += `#   TASKCLUSTER_CLIENT_ID=your-client-id\n`;
    example += `#   TASKCLUSTER_ACCESS_TOKEN=your-access-token\n\n`;
  }

  let command = `curl`;

  // Add method if not GET
  if (method.toUpperCase() !== 'GET') {
    command += ` -X ${method.toUpperCase()}`;
  }

  // Add headers
  if (requiresAuth(entry)) {
    command += ` \\\n  -H "Authorization: Bearer \${TASKCLUSTER_ACCESS_TOKEN}"`;
  }

  // Add request body for methods that typically have one
  if (input) {
    command += ` \\\n  -H "Content-Type: application/json"`;

    let payloadData;

    if (payloadExample) {
      const jsonPayload = formatPayloadJson(payloadExample, 2);

      payloadData = ` \\\n  -d '${jsonPayload}'`;
    } else {
      payloadData = ` \\\n  -d '{\n    "key": "value"\n    # See ${serviceName}/${input} schema for required fields\n  }'`;
    }

    command += payloadData;
  }

  // Add the URL
  command += ` \\\n  "${url}"`;

  example += command;

  // Add note about response
  if (entry.output && entry.output !== 'blob') {
    example += `\n\n# Response will be JSON. To pretty-print, pipe through jq:\n`;
    example += `# ${command.split('\n')[0]} ... | jq .`;
  }

  return example;
}
