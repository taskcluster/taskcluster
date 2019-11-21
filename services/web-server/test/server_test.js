const assert = require('assert');
const helper = require('./helper');
const request = require('superagent');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  const makeSuite = (allowedCORSOrigins, requestOrigin, responseOrigin) => {
    suite(`with ${JSON.stringify(allowedCORSOrigins)}, request origin = ${requestOrigin}`, function() {
      suiteSetup(async function() {
        await helper.load('cfg');
        helper.load.save();
        helper.load.cfg('server.allowedCORSOrigins', allowedCORSOrigins);
      });

      suiteTeardown(function() {
        helper.load.restore();
      });

      helper.withServer(mock, skipping);

      test('request', async function() {
        try {
          await request
            .post(`http://localhost:${helper.serverPort}/graphql`)
            .set('origin', requestOrigin);
          assert.fail();
        } catch (e) {
          assert.equal(e.response.headers['access-control-allow-origin'], responseOrigin);
        }
      });
    });
  };

  // a "regular" rootUrl
  makeSuite(['https://tc.example.com'], 'https://tc.example.com', 'https://tc.example.com');

  // * is used in local development
  makeSuite([true], 'http://localhost', 'http://localhost');

  // check that deploy previews are supported..
  makeSuite(
    ['https://tc.example.com', "/https://deploy-preview-\\d+--taskcluster-web\\.netlify\\.com/"],
    'https://deploy-preview-897--taskcluster-web.netlify.com/',
    'https://deploy-preview-897--taskcluster-web.netlify.com/');
});
