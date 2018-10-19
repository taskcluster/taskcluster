/**
 * Query server / schema to obtain the necessary information
 * about unions and interfaces and write it to a file.
 */
const fetch = require('node-fetch');
const fs = require('fs');
const assert = require('assert');

assert(
  process.env.GRAPHQL_ENDPOINT,
  'GRAPHQL_ENDPOINT is requird to obtain information about unions and interfaces.'
);

fetch(process.env.GRAPHQL_ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    variables: {},
    operationName: '',
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
  }),
})
  .then(result => result.json())
  .then(result => {
    // here we're filtering out any type information unrelated
    // to unions or interfaces
    // eslint-disable-next-line no-underscore-dangle
    const filteredData = result.data.__schema.types.filter(
      type => type.possibleTypes !== null
    );

    // eslint-disable-next-line no-param-reassign, no-underscore-dangle
    result.data.__schema.types = filteredData;
    fs.writeFile(
      './src/fragments/fragmentTypes.json',
      `${JSON.stringify(result.data)}\n`,
      err => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error('Error writing fragmentTypes file', err);
        } else {
          // eslint-disable-next-line no-console
          console.log('Fragment types successfully extracted!');
        }
      }
    );
  });
