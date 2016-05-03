import assert from 'assert';
import { Handler } from '../lib/handler';
import { taskDefinition } from './fixtures/task';
import { statusMessage } from './fixtures/task_status';
import { jobMessage } from './fixtures/job_message';
import parseRoute from '../lib/util/route_parser';

let handler, task, status, expected, pushInfo;

suite('build job message', () => {
  beforeEach(() => {
    handler = new Handler({prefix: 'treeherder'});
    task = JSON.parse(taskDefinition);
    status = JSON.parse(statusMessage);
    expected = JSON.parse(jobMessage);
    pushInfo = parseRoute(task.routes[0]);
  });

  test('valid message', async () => {
    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('no push id', async () => {
    task.routes = ['treeherder.dummyproject.dummya98d9bed366c133ebdf1feb5cf365a3c3703a337'];
    pushInfo = parseRoute(task.routes[0]);
    expected.origin.pushLogID = undefined;

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('default opt label', async () => {
    delete task.extra.treeherder.labels;

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('alternative label', async () => {
    task.extra.treeherder.labels = ['debug'];
    expected.labels = ['debug'];

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('default tier', async () => {
    delete task.extra.treeherder.tier;

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('tier > 1', async () => {
    task.extra.treeherder.tier = 2;
    expected.tier = 2;

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('rerun task', async () => {
    delete task.extra.treeherder.labels;

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('build machine - platform as workerType', async () => {
    delete task.extra.treeherder.machine;

    status.status.runs[status.runId].workerId = 'testworkerid';
    expected.buildMachine = {
      name: 'testworkerid',
      platform: 'DUMMYWORKERTYPE',
      os: '-',
      architecture: '-'
    }

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });

  test('build machine - platform from task', async () => {
    status.status.runs[status.runId].workerId = 'testworkerid';
    expected.buildMachine = {
      name: 'testworkerid',
      platform: 'b2g-emu-x86-kk',
      os: '-',
      architecture: '-'
    }

    let job = await handler.buildMessage(pushInfo, task, status.runId, status);
    assert.deepEqual(job, expected);
  });
});
