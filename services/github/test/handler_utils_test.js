import helper from './helper.js';
import assert from 'assert';
import MockDate from 'mockdate';
import testing from 'taskcluster-lib-testing';
import { GithubCheckOutput, GithubCheck, getTimeDifference } from '../src/handlers/utils.js';
import { CHECK_RUN_STATES } from '../src/constants.js';

/**
 * Tests of installation syncing
 */
helper.secrets.mockSuite(testing.suiteName(), [], function() {
  setup(async function () {
    MockDate.set('2000-05-05T12:12:12.000Z');
  });

  teardown(function () {
    MockDate.reset();
  });

  test('GithubCheckOutput', function() {
    const gco = new GithubCheckOutput({ title: 'a', summary: 'b', text: 'c', annotations: [] });

    // 60000 max - 'a'.length - 'b'.length - 'c'.length = '[]'.length (json)
    assert.equal(59995, gco.getRemainingMaxSize());

    gco.addText('c', '');
    assert.equal(59994, gco.getRemainingMaxSize());

    assert.deepEqual({
      title: 'a',
      summary: 'b',
      text: 'cc',
      annotations: [],
    }, gco.getPayload());

    gco.addText('a'.repeat(59993), '');
    assert.equal(1, gco.getRemainingMaxSize());

    // check overflow
    gco.addText('a'.repeat(100), '');
    assert.equal(0, gco.getRemainingMaxSize());
  });

  test('GithubCheck', function() {
    const gc = new GithubCheck({
      check_run_id: 1,
      status: CHECK_RUN_STATES.QUEUED,

      owner: 'tc',
      repo: 'tc',
      name: 'name',

      output_title: 'test1',
      output_summary: 'summary1',
    });

    assert.deepEqual({
      status: CHECK_RUN_STATES.QUEUED,
    }, gc.getStatusPayload());

    gc.status = CHECK_RUN_STATES.COMPLETED;
    gc.conclusion = 'success';

    assert.deepEqual({
      status: 'completed',
      conclusion: 'success',
      completed_at: '2000-05-05T12:12:12.000Z',
    }, gc.getStatusPayload());

    assert.deepEqual({
      owner: 'tc',
      repo: 'tc',
      name: 'name',
      status: 'completed',
      conclusion: 'success',
      completed_at: '2000-05-05T12:12:12.000Z',
      head_sha: null,
      external_id: null,
      details_url: null,
      output: {
        annotations: [],
        summary: 'summary1',
        text: '',
        title: 'test1',
      },
    }, gc.getCreatePayload());

    assert.deepEqual({
      check_run_id: 1,
      owner: 'tc',
      repo: 'tc',
      status: 'completed',
      conclusion: 'success',
      completed_at: '2000-05-05T12:12:12.000Z',
      output: {
        annotations: [],
        summary: 'summary1',
        text: '',
        title: 'test1',
      },
    }, gc.getUpdatePayload());

    assert.deepEqual({
      check_run_id: 1,
      owner: 'tc',
      repo: 'tc',
    }, gc.getRerequestPayload());
  });

  test('Get Time Difference', function() {

    const START_TIMESTAMP = new Date('2024-07-16T18:23:18.118Z');
    const END_TIMESTAMP_MILLISECONDS = new Date('2024-07-16T18:23:18.128Z');
    const END_TIMESTAMP_SECONDS = new Date('2024-07-16T18:23:28.118Z');
    const END_TIMESTAMP_MINUTES = new Date('2024-07-16T18:33:18.118Z');
    const END_TIMESTAMP_HOURS = new Date('2024-07-17T04:23:18.118Z');
    const END_TIMESTAMP_DAYS = new Date('2024-07-26T18:23:18.118Z');
    const END_TIMESTAMP_GENERIC = new Date('2024-07-27T04:33:28.128Z');

    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_MILLISECONDS), "10 milliseconds");
    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_SECONDS), "10 seconds");
    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_MINUTES), "10 minutes");
    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_HOURS), "10 hours");
    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_DAYS), "10 days");
    assert.equal(getTimeDifference(START_TIMESTAMP, END_TIMESTAMP_GENERIC), "10 days, 10 hours, 10 minutes, 10 seconds, 10 milliseconds");
    assert.equal(getTimeDifference(undefined, undefined), null);
    assert.equal(getTimeDifference("timestamp1", "timestamp2"), null);
  });
});
