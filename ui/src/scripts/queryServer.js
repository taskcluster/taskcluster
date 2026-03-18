/**
 * Query server / schema to obtain the necessary information
 * about unions and interfaces and write it to a file.
 *
 * Run against local web-server:
 * GRAPHQL_ENDPOINT=http://localhost:3050/graphql yarn run create:fragment-matcher
 *
 */
const fs = require('node:fs');
const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const endpoint = typeof window !== 'undefined' ? window?.env?.GRAPHQL_ENDPOINT : process?.env?.GRAPHQL_ENDPOINT;

assert(endpoint, 'GRAPHQL_ENDPOINT is required to obtain information about unions and interfaces.');

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
const req = executor.request(options, (res) => {
  res.on('data', (result) => {
    const response = JSON.parse(Buffer.from(result).toString());
    // here we're filtering out any type information unrelated
    // to unions or interfaces
    // eslint-disable-next-line no-underscore-dangle
    const filteredData = response.data.__schema.types.filter((type) => type.possibleTypes !== null);

    // eslint-disable-next-line no-param-reassign, no-underscore-dangle
    response.data.__schema.types = filteredData;
    fs.writeFile('./src/fragments/fragmentTypes.json', `${JSON.stringify(response.data)}\n`, (err) => {
      if (err) {
      } else {
      }
    });
  });
});

req.on('error', (_error) => {});
req.write(data);
req.end();
