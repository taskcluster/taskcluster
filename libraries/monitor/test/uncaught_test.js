suite('Uncaught Errors', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');
  let nock = require('nock');
  let authmock = require('./authmock');
  let path = require('path');
  let fork = require('child_process').fork;
  let _ = require('lodash');
  let Promise = require('bluebird');

  let monitor = null;

  suiteSetup(async () => {
    authmock.setup();

    monitor = await monitoring({
      project: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
    });
  });

  suiteTeardown(() => {
    authmock.teardown();
  });

  test('should report unhandled rejections', function(done) {

    let sentryScope = nock('https://app.getsentry.com')
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

    let proc = fork(
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

    let proc = fork(
      path.resolve(__dirname, './should_exit_with_error.js'),
      ['--incorrect'],
      {
        env: process.env,
        silent: true,
      }
    );

    let output = '';

    proc.stdout.on('data', function(data) {
      let s = data.toString();
      debug(s);
      output += s;
    });

    proc.stderr.on('data', function(data) {
      let s = data.toString();
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
