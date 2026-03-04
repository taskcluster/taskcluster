/**
 * Generate Rust client library examples for API endpoints
 */

import {
  PLACEHOLDERS,
  getPlaceholderValue,
  requiresAuth,
  capitalize,
  formatPayloadJson,
} from './helpers';

/**
 * Generate a Rust example for an API endpoint
 *
 * @param {string} serviceName - Service name (e.g., 'queue')
 * @param {string} apiVersion - API version (e.g., 'v1')
 * @param {object} entry - API entry metadata
 * @param {object} payloadExample - Example payload object (optional)
 * @returns {string} Rust code example
 */
export default function generateRustExample(
  serviceName,
  apiVersion,
  entry,
  payloadExample = null
) {
  const className = capitalize(serviceName);
  const params = entry.args.map(arg => `"${getPlaceholderValue(arg)}"`);
  // Build imports
  const imports = entry.input
    ? `use taskcluster::{${className}, ClientBuilder, Credentials};
use anyhow::Result;
use serde_json::json;`
    : `use taskcluster::{${className}, ClientBuilder, Credentials};
use anyhow::Result;`;
  // Build client initialization
  let clientInit;

  if (requiresAuth(entry)) {
    clientInit = `// Option 1: Explicit credentials
    let creds = Credentials {
        client_id: "${PLACEHOLDERS.clientId}".to_string(),
        access_token: "${PLACEHOLDERS.accessToken}".to_string(),
        certificate: None,
    };
    let client = ${className}::new(
        ClientBuilder::new("${PLACEHOLDERS.rootUrl}")
            .credentials(creds)
    )?;

    // Option 2: Credentials from environment variables
    // Requires: TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, TASKCLUSTER_ACCESS_TOKEN
    // let creds = Credentials::from_env()?;
    // let root_url = std::env::var("TASKCLUSTER_ROOT_URL")?;
    // let client = ${className}::new(ClientBuilder::new(&root_url).credentials(creds))?;`;
  } else {
    clientInit = `// No authentication required for this endpoint
    let client = ${className}::new(ClientBuilder::new("${PLACEHOLDERS.rootUrl}"))?;`;
  }

  // Build API call
  let apiCall;

  if (entry.input) {
    let payloadCode;

    if (payloadExample) {
      // Use actual payload example in json! macro
      const jsonPayload = formatPayloadJson(payloadExample, 8);

      payloadCode = `// Create request payload - see schema at:
    // ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    let payload = json!(${jsonPayload});`;
    } else {
      payloadCode = `// Create request payload
    // See schema at: ${PLACEHOLDERS.rootUrl}/schemas/${serviceName}/${entry.input}
    let payload = json!({
        // Fill in required fields according to the schema
    });`;
    }

    apiCall = `${payloadCode}

    // Call the API method
    let result = client.${entry.name}(${params.join(', ')}, &payload).await?;`;
  } else {
    apiCall = `// Call the API method
    let result = client.${entry.name}(${params.join(', ')}).await?;`;
  }

  // Build response handling
  let responseHandling;

  if (entry.output && entry.output !== 'blob') {
    responseHandling = `println!("Success: {:?}", result);`;
  } else if (entry.output === 'blob') {
    responseHandling = `println!("Downloaded {} bytes", result.len());`;
  } else {
    responseHandling = `println!("Success");`;
  }

  // Assemble the complete example
  const example = `${imports}

#[tokio::main]
async fn main() -> Result<()> {
    ${clientInit}

    ${apiCall}
    ${responseHandling}
    Ok(())
}`;

  return example;
}
