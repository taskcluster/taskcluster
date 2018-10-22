const assert = require('assert');
const monitoring = require('../');
const debug = require('debug')('test');
const nock = require('nock');
const authmock = require('./authmock');
const path = require('path');
const fork = require('child_process').fork;
const _ = require('lodash');
const Promise = require('bluebird');
const libUrls = require('taskcluster-lib-urls');

suite('Uncaught Errors', () => {
  let monitor = null;

  suiteSetup(async () => {
    authmock.setup();

    monitor = await monitoring({
      rootUrl: libUrls.testRootUrl(),
      projectName: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
    });
  });

  suiteTeardown(() => {
    authmock.teardown();
  });

  test('should report unhandled rejections', function(done) {

    const sentryScope = nock('https://app.getsentry.com')
      .filteringRequestBody(/.*/, '*')
      .post('/api/12345/store/', '*')
      .reply(200, () => {
        debug('called Sentry.');
        done();
      });

    Promise.resolve().then(() => {
      throw new Error('This should hopefully bubble up to the top!');
    });
  });

  // These tests needs to take place in an external function that we
  // fork to avoid issues with uncaught exceptions and mocha and
  // our process.exit behavior.

  test('should report uncaught exceptions', function(done) {

    const proc = fork(
      path.resolve(__dirname, './should_exit_with_error.js'),
      ['--correct'],
      {
        env: process.env,
        silent: true,
      }
    );

    let output = '';

    proc.stdout.on('data', function(data) {
      output += data.toString();
    });

    proc.stderr.on('data', function(data) {
      output += data.toString();
    });

    proc.on('exit', function(code) {
      try {
        assert(_.startsWith(output,
          [
            'Uncaught Exception! Attempting to report to Sentry and crash.',
            'Error: This should bubble up to the top',
          ].join('\n')
        ));
        assert(_.endsWith(output, 'Called Sentry.\nSuccesfully reported error to Sentry.\n'));
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  test('should exit no matter what', function(done) {

    const proc = fork(
      path.resolve(__dirname, './should_exit_with_error.js'),
      ['--incorrect'],
      {
        env: process.env,
        silent: true,
      }
    );

    let output = '';

    proc.stdout.on('data', function(data) {
      const s = data.toString();
      debug(s);
      output += s;
    });

    proc.stderr.on('data', function(data) {
      const s = data.toString();
      debug(s);
      output += s;
    });

    proc.on('exit', function(code) {
      try {
        assert(_.startsWith(output,
          [
            'Uncaught Exception! Attempting to report to Sentry and crash.',
            'Error: This should bubble up to the top',
          ].join('\n')
        ));
        assert(_.endsWith(output, 'Failed to report error to Sentry after timeout!\n'));
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
