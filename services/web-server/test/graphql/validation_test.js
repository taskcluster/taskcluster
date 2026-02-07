import assert from 'assert';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
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
        assert.fail('Expected query to fail');
      } catch (err) {
        assert.ok(err.networkError.statusCode === 400);
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
    test('circular fragments return a validation error', async function() {
      const client = helper.getHttpClient({ suppressErrors: true });

      try {
        await client.query({
          query: gql`
            query CircularFragment {
              secrets(filter: {}) {
                ...FragA
              }
            }

            fragment FragA on SecretsConnection {
              pageInfo {
                hasNextPage
              }
              ...FragB
            }

            fragment FragB on SecretsConnection {
              pageInfo {
                hasPreviousPage
              }
              ...FragA
            }
          `,
        });
        assert.fail('Expected query to fail validation');
      } catch (err) {
        assert.ok(err.networkError.statusCode >= 400);
        const { errors } = err.networkError.result || {};
        assert.ok(
          Array.isArray(errors) && errors.length > 0,
          `unexpected validation error payload: ${JSON.stringify(err.networkError.result)}`,
        );
      }
    });
  });
});
