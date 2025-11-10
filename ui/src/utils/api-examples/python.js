/**
 * Generate Python client library examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  capitalize,
  formatPayloadJson,
} from './helpers';

/**
 * Generate a Python example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {boolean} isAsync - Generate async or sync version
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} Python code example
 */
export default function generatePythonExample(
  serviceName,
  apiVersion,
  entry,
  isAsync,
  payloadExample = null
) {
  const className = capitalize(serviceName);
  const params = entry.args.map(arg => `'${getPlaceholderValue(arg)}'`);
  const tcModule = isAsync ? 'taskcluster.aio' : 'taskcluster';
  // Build imports
  const imports = isAsync
    ? `import taskcluster.aio
import asyncio`
    : `import taskcluster`;
  // Build client initialization
  let clientInit;

  if (requiresAuth(entry)) {
    clientInit = `# Option 1: Explicit credentials
${serviceName} = ${tcModule}.${className}({
    'rootUrl': '${PLACEHOLDERS.rootUrl}',
    'credentials': {
        'clientId': '${PLACEHOLDERS.clientId}',
        'accessToken': '${PLACEHOLDERS.accessToken}'
    }
})

# Option 2: Credentials from environment variables
# Requires: TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, TASKCLUSTER_ACCESS_TOKEN
# ${serviceName} = ${tcModule}.${className}(taskcluster.optionsFromEnvironment())`;
  } else {
    clientInit = `# No authentication required for this endpoint
${serviceName} = ${tcModule}.${className}({'rootUrl': '${PLACEHOLDERS.rootUrl}'})`;
  }

  // Build API call and error handling
  let mainCode;

  if (isAsync) {
    let apiCall;

    if (entry.input) {
      let payloadCode;

      if (payloadExample) {
        // Use actual payload example
        const jsonPayload = formatPayloadJson(payloadExample, 8);

        payloadCode = `# Request payload - see schema at:
        # ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
        payload = ${jsonPayload}`;
      } else {
        payloadCode = `# Request payload
        # Schema: ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
        payload = {
            # Fill in required fields according to the schema
        }`;
      }

      apiCall = `${payloadCode}
        result = await ${serviceName}.${entry.name}(${params.join(
        ', '
      )}, payload)`;
    } else {
      apiCall = `# Call the API method
        result = await ${serviceName}.${entry.name}(${params.join(', ')})`;
    }

    let responseHandling;

    if (entry.output && entry.output !== 'blob') {
      responseHandling = `print(f"Success: {result}")
        return result`;
    } else if (entry.output === 'blob') {
      responseHandling = `print(f"Downloaded {len(result)} bytes")
        return result`;
    } else {
      responseHandling = `print("Success")`;
    }

    mainCode = `async def call_api():
    try:
        ${apiCall}
        ${responseHandling}
    except taskcluster.exceptions.TaskclusterAuthFailure as e:
        print(f"Authentication failed: {e}")
    except taskcluster.exceptions.TaskclusterRestFailure as e:
        print(f"API error {e.status_code}: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

# Run the async function
asyncio.run(call_api())`;
  } else {
    let apiCall;

    if (entry.input) {
      let payloadCode;

      if (payloadExample) {
        // Use actual payload example
        const jsonPayload = formatPayloadJson(payloadExample, 4);

        payloadCode = `# Request payload - see schema at:
    # ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    payload = ${jsonPayload}`;
      } else {
        payloadCode = `# Request payload
    # Schema: ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    payload = {
        # Fill in required fields according to the schema
    }`;
      }

      apiCall = `${payloadCode}
    result = ${serviceName}.${entry.name}(${params.join(', ')}, payload)`;
    } else {
      apiCall = `# Call the API method
    result = ${serviceName}.${entry.name}(${params.join(', ')})`;
    }

    let responseHandling;

    if (entry.output && entry.output !== 'blob') {
      responseHandling = `print(f"Success: {result}")`;
    } else if (entry.output === 'blob') {
      responseHandling = `print(f"Downloaded {len(result)} bytes")`;
    } else {
      responseHandling = `print("Success")`;
    }

    mainCode = `try:
    ${apiCall}
    ${responseHandling}
except taskcluster.exceptions.TaskclusterAuthFailure as e:
    print(f"Authentication failed: {e}")
except taskcluster.exceptions.TaskclusterRestFailure as e:
    print(f"API error {e.status_code}: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")`;
  }

  // Assemble the complete example
  const example = `${imports}

${clientInit}

${mainCode}`;

  return example;
}
