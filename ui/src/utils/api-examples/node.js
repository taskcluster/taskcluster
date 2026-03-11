/**
 * Generate Node.js client library examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  capitalize,
  formatPayloadJson,
} from './helpers';

/**
 * Generate a Node.js example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} Node.js code example
 */
export default function generateNodeExample(
  serviceName,
  apiVersion,
  entry,
  payloadExample = null
) {
  const className = capitalize(serviceName);
  const params = entry.args.map(arg => `'${getPlaceholderValue(arg)}'`);
  // Build client initialization
  let clientInit;

  if (requiresAuth(entry)) {
    clientInit = `// Option 1: Explicit credentials
  const ${serviceName} = new taskcluster.${className}({
    rootUrl: '${PLACEHOLDERS.rootUrl}',
    credentials: {
      clientId: '${PLACEHOLDERS.clientId}',
      accessToken: '${PLACEHOLDERS.accessToken}'
    }
  });

  // Option 2: Credentials from environment variables
  // Requires: TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, TASKCLUSTER_ACCESS_TOKEN
  // const ${serviceName} = new taskcluster.${className}({
  //   ...taskcluster.fromEnvVars(),
  // });`;
  } else {
    clientInit = `// No authentication required for this endpoint
  const ${serviceName} = new taskcluster.${className}({
    rootUrl: '${PLACEHOLDERS.rootUrl}'
  });`;
  }

  // Build API call
  let apiCall;

  if (entry.input) {
    let payloadCode;

    if (payloadExample) {
      // Use actual payload example
      const jsonPayload = formatPayloadJson(payloadExample, 4);

      payloadCode = `// Request payload - see schema at:
    // ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    const payload = ${jsonPayload};`;
    } else {
      payloadCode = `// Request payload
    // See schema at: ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    const payload = {
      // Fill in required fields according to the schema
    };`;
    }

    apiCall = `${payloadCode}

    // Call the API method
    const result = await ${serviceName}.${entry.name}(${params.join(
      ', '
    )}, payload);`;
  } else {
    apiCall = `// Call the API method
    const result = await ${serviceName}.${entry.name}(${params.join(', ')});`;
  }

  // Build response handling
  let responseHandling;

  if (entry.output && entry.output !== 'blob') {
    responseHandling = `console.log('Success:', result);
    return result;`;
  } else if (entry.output === 'blob') {
    responseHandling = `console.log(\`Downloaded \${result.length} bytes\`);
    return result;`;
  } else {
    responseHandling = `console.log('Success');`;
  }

  // Assemble the complete example
  const example = `const taskcluster = require('@taskcluster/client');

async function callApi() {
  ${clientInit}

  try {
    ${apiCall}
    ${responseHandling}
  } catch (err) {
    // Handle Taskcluster API errors
    if (err.statusCode) {
      console.error(\`API Error \${err.statusCode}: \${err.message}\`);
    } else {
      console.error('Unexpected error:', err);
    }
    throw err;
  }
}

// Run the function
callApi().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});`;

  return example;
}
