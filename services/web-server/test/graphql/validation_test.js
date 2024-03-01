import assert from 'assert';
import gql from 'graphql-tag';
import testing from 'taskcluster-lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('GraphQL Validation', function() {
    test('max tokens in request', async function() {
      const client = helper.getHttpClient({ suppressErrors: true });

      try {
        await client.query({
          query: gql`
            query {
              ${' a '.repeat(100000)}
            }
          `,
        });
      } catch (err) {
        assert.equal('PayloadTooLargeError', err.networkError.result.name);
        assert.ok(err.networkError.statusCode >= 400);
      }
    });
    test('max queries in request', async function() {
      const client = helper.getHttpClient({ suppressErrors: true });

      try {
        await client.query({
          query: gql`
            query {
              ${' a '.repeat(1000)}
            }
          `,
        });
      } catch (err) {
        assert.ok(err.networkError.statusCode >= 400);
        assert.ok(/validation errors/.test(JSON.stringify(err.networkError.result)));
      }
    });
    test('max depth in request', async function() {
      const client = helper.getHttpClient({ suppressErrors: true });

      try {
        await client.query({
          query: gql`
            query {
              ${ Array(20).fill('').reduce((child, _) => `a { ${child} }`, 'a') }
            }
          `,
        });
      } catch (err) {
        assert.ok(err.networkError.statusCode >= 400);
        assert.ok(/exceeds maximum operation depth/.test(JSON.stringify(err.networkError.result)));
      }
    });
  });
});
