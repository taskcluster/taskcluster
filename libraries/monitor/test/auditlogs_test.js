suite('Audit Logs', () => {
  let _ = require('lodash');
  let assert = require('assert');
  let monitoring = require('../');
  let AWS = require('aws-sdk-mock');
  let testing = require('taskcluster-lib-testing');
  let nock = require('nock');
  let authmock = require('./authmock');

  let logName = 'mocked-stream';
  let monitor = null;
  let records = {};

  setup(async () => {
    authmock.setup();
    AWS.mock('Firehose', 'describeDeliveryStream', (params, callback) => {
      records[params.DeliveryStreamName] = [];
      callback(null, {DeliveryStreamDescription: {DeliveryStreamStatus: 'ACTIVE'}});
    });
    AWS.mock('Firehose', 'putRecord', (params, callback) => {
      if (params.Record.Data.indexOf('\n') === -1) {
        return callback(new Error('Must always submit at least 1 record!'), null);
      }
      if (Buffer.byteLength(params.Record.Data, 'utf-8') > 1000 * 1000) {
        return callback(new Error('Record size too large!'), null);
      }
      let DeliveryStreamName = params.DeliveryStreamName;
      let r = params.Record.Data.split('\n').map(x => x.trim());
      r.pop(); // To get rid of empty space at end
      records[DeliveryStreamName] = records[DeliveryStreamName].concat(r);
      callback(null, {FailedPutCount: 0});
    });

    monitor = await monitoring({
      project: 'tc-lib-monitor',
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
    let subject = {test: 123};
    monitor.log(subject);
    await monitor.flush();
    assert.equal(records[logName].length, 1);
    assert.deepEqual(records[logName].map(JSON.parse)[0], subject);
  });

  test('should not write 0 logs on flush', async function() {
    await monitor.flush();
    assert.equal(records[logName].length, 0);
  });

  test('should write logs with newlines in them', async function() {
    let subject = {test: 'abc\n123'};
    monitor.log(subject);
    await monitor.flush();
    assert.equal(records[logName].length, 1);
    assert.deepEqual(records[logName].map(JSON.parse)[0], subject);
  });

  test('should write logs on 500 records', async function() {
    let subjects = _.range(5302).map(i => ({foo: i}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    assert.equal(records[logName].length, 5302);
    assert.deepEqual(records[logName].map(JSON.parse), subjects);
  });

  test('should write logs on too many bytes', async function() {
    // This should get the records to be over 4MB in total
    let subjects = _.range(250).map(i => ({foo: i, bar: _.repeat('#', 16000)}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    assert.equal(records[logName].length, 250);
    assert.deepEqual(records[logName].map(JSON.parse), subjects);
  });

  test('should write logs on timeout', async function() {
    let subject = {test: 1000, timerthing: true};
    monitor.log(subject);
    await testing.poll(async () => {
      assert.equal(records[logName].length, 1);
      assert.deepEqual(records[logName].map(JSON.parse)[0], subject);
    });
    subject = {test: 2000, timerthing: true};
    monitor.log(subject);
    await testing.poll(async () => {
      assert.equal(records[logName].length, 2);
      assert.deepEqual(records[logName].map(JSON.parse)[1], subject);
    });
  });

  test('should eventually stop trying to resubmit', async function() {
    AWS.restore('Firehose', 'putRecord');
    AWS.mock('Firehose', 'putRecord', (params, callback) => {
      return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
    });
    let closed = false;
    monitor.log({test: 'foobar'});
    await monitor.flush().then(() => {closed = true;});
    assert(closed, 'Failed to reject permanently failing submission.');
  });

  test('should resubmit all on error', async function() {
    let tried = false;
    AWS.restore('Firehose', 'putRecord');
    AWS.mock('Firehose', 'putRecord', (params, callback) => {
      if (!tried) {
        tried = true;
        return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
      }
      let DeliveryStreamName = params.DeliveryStreamName;
      let r = params.Record.Data.split('\n').map(x => x.trim());
      r.pop();
      records[DeliveryStreamName] = records[DeliveryStreamName].concat(r);
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
    AWS.restore('Firehose', 'putRecord');
    AWS.mock('Firehose', 'putRecord', (params, callback) => {
      submissions++;
      if (!tried) {
        tried = true;
        return callback({statusCode: 500, message: 'uh oh!', retryable: true}, null);
      }
      let DeliveryStreamName = params.DeliveryStreamName;
      let r = params.Record.Data.split('\n').map(x => x.trim());
      r.pop();
      records[DeliveryStreamName] = records[DeliveryStreamName].concat(r);
      callback(null, {FailedPutCount: 0});
    });
    let subjects = _.range(999).map(i => ({foo: Array(5000).join('x')}));
    subjects.forEach(subject => monitor.log(subject));
    await monitor.flush();
    await testing.poll(async () => {
      assert.equal(records[logName].length, 999);
    });
    assert.equal(submissions, 7); // We would normally need 6 submissions
  });
});
