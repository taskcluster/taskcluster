/**
 * Query server / schema to obtain the necessary information
 * about unions and interfaces and write it to a file.
 *
 * Run against local web-server:
 * GRAPHQL_ENDPOINT=http://localhost:3050/graphql yarn run create:possible-types
 *
 */
const fs = require('fs');
const assert = require('assert');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const endpoint =
  typeof window !== 'undefined'
    ? window?.env?.GRAPHQL_ENDPOINT
    : process?.env?.GRAPHQL_ENDPOINT;

assert(
  endpoint,
  'GRAPHQL_ENDPOINT is required to obtain information about unions and interfaces.'
);

const parsed = new URL(endpoint);
const data = JSON.stringify({
  variables: {},
  query: `
    {
      __schema {
        types {
          kind
          name
          possibleTypes {
            name
          }
        }
      }
    }
  `,
});
const options = {
  hostname: parsed.hostname,
  port: parsed.port,
  path: parsed.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};
const executor = parsed.protocol === 'https:' ? https : http;
const req = executor.request(options, res => {
  const chunks = [];

  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const response = JSON.parse(Buffer.concat(chunks).toString());
    // { [supertype]: [subtype, ...] }
    const possibleTypes = {};

    for (const type of response.data.__schema.types) {
      if (type.possibleTypes !== null) {
        possibleTypes[type.name] = type.possibleTypes.map(
          subtype => subtype.name
        );
      }
    }

    fs.writeFile(
      './src/fragments/possibleTypes.json',
      `${JSON.stringify(possibleTypes)}\n`,
      err => {
        if (err) {
          // biome-ignore lint/suspicious/noConsole: build time script output
          console.error('Error writing possibleTypes file', err);
        } else {
          // biome-ignore lint/suspicious/noConsole: build time script output
          console.log('Fragment types successfully extracted!');
        }
      }
    );
  });
});

req.on('error', error => {
  // biome-ignore lint/suspicious/noConsole: build time script output
  console.error(error);
});
req.write(data);
req.end();
