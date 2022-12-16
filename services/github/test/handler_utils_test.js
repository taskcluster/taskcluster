const helper = require('./helper');
const assert = require('assert');
const MockDate = require('mockdate');
const testing = require('taskcluster-lib-testing');
const { GithubCheckOutput, GithubCheck } = require('../src/handlers/utils');
const { CHECK_RUN_STATES } = require('../src/constants');

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
});
