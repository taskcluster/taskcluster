/**
 * Generate Go client library examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  capitalize,
  formatPayloadJson,
} from './helpers';

/**
 * Convert hyphenated service name to valid Go identifier
 * @param {string} name - Service name (e.g., 'worker-manager')
 * @returns {string} Valid Go identifier (e.g., 'workerManager')
 */
function formatGoIdentifier(name) {
  if (!name.includes('-')) {
    return name;
  }

  const parts = name.split('-');

  return (
    parts[0] +
    parts
      .slice(1)
      .map(capitalize)
      .join('')
  );
}

/**
 * Generate a Go example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {string} version - Taskcluster version (default: '93')
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} Go code example
 */
export default function generateGoExample(
  serviceName,
  apiVersion,
  entry,
  version = '93',
  payloadExample = null
) {
  const methodName = capitalize(entry.name);
  const varName = formatGoIdentifier(serviceName);
  const packageName = `tc${serviceName.toLowerCase().replace(/-/g, '')}`;
  const params = entry.args.map(arg => `"${getPlaceholderValue(arg)}"`);
  // Build imports
  const imports = ['fmt', 'log'];

  if (requiresAuth(entry)) {
    imports.push('os');
  }

  if (entry.input) {
    imports.push('encoding/json');
  }

  const importStatements = imports.map(imp => `	"${imp}"`).join('\n');
  // Build client initialization
  let clientInit;

  if (requiresAuth(entry)) {
    clientInit = `// Option 1: Explicit credentials
	creds := &tcclient.Credentials{
		ClientID:    "${PLACEHOLDERS.clientId}",
		AccessToken: "${PLACEHOLDERS.accessToken}",
	}
	${varName} := ${packageName}.New(creds, "${PLACEHOLDERS.rootUrl}")

	// Option 2: Credentials from environment variables
	// Requires: TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, TASKCLUSTER_ACCESS_TOKEN
	// creds := &tcclient.Credentials{
	//     ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
	//     AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
	// }
	// ${varName} := ${packageName}.New(creds, os.Getenv("TASKCLUSTER_ROOT_URL"))`;
  } else {
    clientInit = `// No authentication required for this endpoint
	${varName} := ${packageName}.New(nil, "${PLACEHOLDERS.rootUrl}")`;
  }

  // Build API call
  let apiCall;

  if (entry.input) {
    let payloadCode;

    if (payloadExample) {
      // Use actual payload example with JSON unmarshaling
      const jsonPayload = formatPayloadJson(payloadExample, 2);

      payloadCode = `// Create request payload - see schema at:
	// ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
	payloadJSON := []byte(\`${jsonPayload}\`)

	payload := &${packageName}.${methodName}Request{}
	if err := json.Unmarshal(payloadJSON, payload); err != nil {
		log.Fatalf("Failed to parse payload: %v", err)
	}`;
    } else {
      payloadCode = `// Create request payload
	// See schema at: ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
	payload := &${packageName}.${methodName}Request{
		// Fill in required fields according to the schema
	}`;
    }

    apiCall = `${payloadCode}

	// Call the API method
	result, err := ${varName}.${methodName}(${params.join(', ')}, payload)`;
  } else {
    apiCall = `// Call the API method
	result, err := ${varName}.${methodName}(${params.join(', ')})`;
  }

  // Build response handling
  let responseHandling;

  if (entry.output && entry.output !== 'blob') {
    responseHandling = `// Handle successful response
	fmt.Printf("Success: %+v\n", result)`;
  } else if (entry.output === 'blob') {
    responseHandling = `// Handle blob response
	fmt.Printf("Downloaded %d bytes\n", len(result))`;
  } else {
    responseHandling = `// Method completed successfully
	fmt.Println("Success")`;
  }

  // Assemble the complete example
  const example = `package main

import (
${importStatements}

	tcclient "github.com/taskcluster/taskcluster/v${version}/clients/client-go"
	"github.com/taskcluster/taskcluster/v${version}/clients/client-go/${packageName}"
)

func main() {
	${clientInit}

	${apiCall}
	if err != nil {
		// Handle error
		log.Fatalf("API call failed: %v", err)
	}

	${responseHandling}
}`;

  return example;
}
