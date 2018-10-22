const _ = require('lodash');
const assert = require('assert');
const monitoring = require('../');
const AWS = require('aws-sdk-mock');
const testing = require('taskcluster-lib-testing');
const libUrls = require('taskcluster-lib-urls');
const nock = require('nock');
const authmock = require('./authmock');

suite('Audit Logs', () => {
  const logName = 'mocked-stream';
  let records = {};
  let monitor = null;

  setup(async () => {
    authmock.setup();
    AWS.mock('Kinesis', 'describeStream', (params, callback) => {
      records[params.StreamName] = [];
      callback(null, {StreamDescription: {StreamStatus: 'ACTIVE'}});
    });
    AWS.mock('Kinesis', 'putRecords', (params, callback) => {
      if (params.Records.length <= 0) {
        return callback(new Error('Must always submit at least 1 record!'), null);
      }
      if (Buffer.byteLength(params.Records.join(','), 'utf-8') > 1000 * 1000) {
        return callback(new Error('Record size too large!'), null);
      }
      const StreamName = params.StreamName;
      records[StreamName] = records[StreamName].concat(params.Records);
      callback(null, {FailedPutCount: 0});
    });

    monitor = await monitoring({
      rootUrl: libUrls.testRootUrl(),
      projectName: 'tc-lib-monitor',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      patchGlobal: false,
      reportStatsumErrors: false,
      reportAuditLogErrors: false,
      resourceInterval: 1,
      aws: {credentials: {accessKeyId: 'foo', secretAccessKey: 'bar'}, region: 'us-east-1'},
      logName,
    });
  });

  teardown(async () => {
    await monitor.flush();
    authmock.teardown();
    AWS.restore();
    records = {};
  });

  test('should write logs on explicit flush', async function() {
    const subject = {test: 123};
    monitor.log(subject);
    await monitor.flush();
    assert.equal(records[logName].length, 1);
    assert.deepEqual(JSON.parse(records[logName][0]['Data']), subject);
  });

  test('should not write 0 logs on flush', async function() {
    await monitor.flush();
    assert.equal(records[logName].length, 0);
  });

  test('should write logs with newlines in them', async function() {
    const subject = {test: 'abc\n123'};
    monitor.log(subject);
    await monitor.flush();
    assert.equal(records[logName].length, 1);
    assert.deepEqual(JSON.parse(records[logName][0]['Data']), subject);
  });

  test('should write logs on 500 records', async function() {
    const subjects = _.range(5302).map(i => ({foo: i}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    assert.equal(records[logName].length, 5302);
    assert.deepEqual(records[logName].map(l => {
      return JSON.parse(l['Data']);
    }), subjects);
  });

  test('should write logs on too many bytes', async function() {
    // This should get the records to be over 4MB in total
    const subjects = _.range(250).map(i => ({foo: i, bar: _.repeat('#', 16000)}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    assert.equal(records[logName].length, 250);
    assert.deepEqual(records[logName].map(l => {
      return JSON.parse(l['Data']);
    }), subjects);
  });

  test('should write logs on timeout', async function() {
    let subject = {test: 1000, timerthing: true};
    monitor.log(subject);
    await testing.poll(async () => {
      assert.equal(records[logName].length, 1);
      assert.deepEqual(JSON.parse(records[logName][0]['Data']), subject);
    });
    subject = {test: 2000, timerthing: true};
    monitor.log(subject);
    await testing.poll(async () => {
      assert.equal(records[logName].length, 2);
      assert.deepEqual(JSON.parse(records[logName][1]['Data']), subject);
    });
  });

  test('should eventually stop trying to resubmit', async function() {
    AWS.restore('Kinesis', 'putRecord');
    AWS.mock('Kinesis', 'putRecord', (params, callback) => {
      return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
    });
    let closed = false;
    monitor.log({test: 'foobar'});
    await monitor.flush().then(() => {closed = true;});
    assert(closed, 'Failed to reject permanently failing submission.');
  });

  test('should resubmit all on error', async function() {
    let tried = false;
    AWS.restore('Kinesis', 'putRecord');
    AWS.mock('Kinesis', 'putRecord', (params, callback) => {
      if (!tried) {
        tried = true;
        return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
      }
      records[StreamName] = records[StreamName].concat(params.Records);
      callback(null, {FailedPutCount: 0});
    });
    monitor.log({test: 'foobar'});
    monitor.log({test: 'foobar2'});
    await monitor.flush();
    await testing.poll(async () => {
      assert.equal(records[logName].length, 2);
    });
  });

  test('should resubmit all on error even with multiple chunks', async function() {
    let tried = false;
    let submissions = 0;
    AWS.restore('Kinesis', 'putRecords');
    AWS.mock('Kinesis', 'putRecords', (params, callback) => {
      submissions++;
      if (!tried) {
        tried = true;
        return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
      }
      const StreamName = params.StreamName;
      records[StreamName] = records[StreamName].concat(params.Records);
      callback(null, {FailedPutCount: 0});
    });
    const subjects = _.range(999).map(i => ({foo: Array(5000).join('x')}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    await testing.poll(async () => {
      assert.equal(records[logName].length, 999);
    });
    assert.equal(submissions, 7); // We would normally need 6 submissions
  });
});
