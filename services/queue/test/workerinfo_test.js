const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

const { Worker, TaskQueue } = require('../src/data');
const { splitTaskQueueId } = require('../src/utils');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const makeTaskQueue = async (opts) => {
    const taskQueueId = opts.taskQueueId || 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended';
    const db = await helper.load('db');
    await db.fns.task_queue_seen({
      task_queue_id_in: taskQueueId,
      expires_in: opts.expires || new Date('3017-07-29'),
      description_in: opts.description || 'test-worker-type',
      stability_in: opts.stability || 'experimental',
    });
    return await TaskQueue.get(db, taskQueueId, new Date());
  };

  const makeWorker = async (opts) => {
    const task_queue_id_in = opts.taskQueueId || 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended';
    const worker_group_in = opts.workerGroup || 'my-worker-group-extended-extended';
    const worker_id_in = opts.workerId || 'my-worker-extended-extended';
    const expires_in = opts.expires || new Date('3017-07-29');

    // emulate "creation" by seeing the worker, quarantining if necessary, and seeing tasks
    const db = await helper.load('db');
    await db.fns.queue_worker_seen_with_last_date_active({
      task_queue_id_in,
      worker_group_in,
      worker_id_in,
      expires_in,
    });

    if (opts.quarantineUntil) {
      // quarantine_queue_worker_with_last_date_active would bump the expires column, so we set it manually
      await helper.withDbClient(async client => {
        await client.query(`
          update queue_workers
          set quarantine_until = $1
          where task_queue_id = $2 and worker_group = $3 and worker_id = $4`,
        [opts.quarantineUntil, task_queue_id_in, worker_group_in, worker_id_in]);
      });
    }

    for (let task of opts.recentTasks || []) {
      await db.fns.queue_worker_task_seen({
        task_queue_id_in, worker_group_in, worker_id_in,
        task_run_in: task,
      });
    }

    return await Worker.get(db, task_queue_id_in, worker_group_in, worker_id_in, new Date(0));
  };

  let workerInfo;
  suiteSetup('load workerInfo', async function() {
    if (skipping()) {
      return;
    }
    workerInfo = await helper.load('workerInfo');
    workerInfo.updateFrequency = '0 seconds'; // don't skip updates
  });

  test('queue.listProvisioners returns an empty list', async () => {
    const result = await helper.queue.listProvisioners();
    assert.equal(result.provisioners.length, 0, 'Did not expect any provisioners');
  });

  test('queue.listProvisioners requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.listProvisioners(),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.listProvisioners returns provisioners', async () => {
    const taskQueue = await makeTaskQueue({});
    const { provisionerId } = splitTaskQueueId(taskQueue.taskQueueId);

    const result = await helper.queue.listProvisioners();
    assert.equal(result.provisioners.length, 1, 'expected provisioners');
    assert(result.provisioners[0].provisionerId === provisionerId, 'expected prov1-extended-extended-extended');
    assert(result.provisioners[0].description === '', 'expected empty description');
    assert(result.provisioners[0].stability === 'experimental', 'expected stability');
    assert.equal(result.provisioners[0].actions.length, 0, 'expected no actions');
  });

  test('provisioner seen creates and updates a provisioner', async () => {
    const workerInfo = await helper.load('workerInfo');

    await Promise.all([
      workerInfo.seen('prov2/not-important'),
      workerInfo.seen('prov2/not-important'),
    ]);
    await workerInfo.seen('prov2/not-important');

    const result = await helper.queue.listProvisioners();
    assert.equal(result.provisioners.length, 1, 'expected a provisioner');
  });

  test('provisioner expiration works', async () => {
    await makeTaskQueue({ expires: new Date('2000-01-01') });

    await helper.runExpiration('expire-worker-info');

    const result = await helper.queue.listProvisioners();
    assert.equal(result.provisioners.length, 0, 'expected no provisioners');
  });

  test('queue.listWorkerTypes returns an empty list', async () => {
    const result = await helper.queue.listWorkerTypes('no-provisioner');

    assert.equal(result.workerTypes.length, 0, 'did not expect any worker-types');
  });

  test('queue.listWorkerTypes requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.listWorkerTypes('no-provisioner'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.listWorkerTypes returns workerTypes', async () => {
    const tQueue = await makeTaskQueue({});

    const result = await helper.queue.listWorkerTypes('prov1-extended-extended-extended');
    assert.equal(result.workerTypes.length, 1, 'expected workerTypes');
    const [_, workerType] = tQueue.taskQueueId.split('/');
    assert(result.workerTypes[0].workerType === workerType, `expected ${workerType}`);
  });

  test('list worker-types (limit and continuationToken)', async () => {
    await makeTaskQueue({
      taskQueueId: 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended',
    });
    await makeTaskQueue({
      taskQueueId: 'prov1-extended-extended-extended/gecko-b-2-android',
    });

    let result = await helper.queue.listWorkerTypes('prov1-extended-extended-extended', { limit: 1 });

    assert(result.continuationToken);
    assert.equal(result.workerTypes.length, 1);

    result = await helper.queue.listWorkerTypes('prov1-extended-extended-extended', {
      limit: 1,
      continuationToken: result.continuationToken,
    });

    assert(!result.continuationToken);
    assert.equal(result.workerTypes.length, 1);
  });

  test('worker-type seen creates and updates a worker-type', async () => {
    const workerInfo = await helper.load('workerInfo');
    const workerType = 'gecko-b-2-linux-extended-extended';

    await Promise.all([
      workerInfo.seen(`prov2/${workerType}`),
      workerInfo.seen(`prov2/${workerType}`),
    ]);

    const result = await helper.queue.listWorkerTypes('prov2');
    assert.equal(result.workerTypes.length, 1, 'expected a worker-type');
  });

  test('worker-type expiration works', async () => {
    await makeTaskQueue({
      expires: new Date('2017-07-29'),
    });

    await helper.runExpiration('expire-worker-info');

    const result = await helper.queue.listWorkerTypes('prov1-extended-extended-extended');
    assert.equal(result.workerTypes.length, 0, 'expected no worker-types');
  });

  test('queue.listTaskQueues returns an empty list', async () => {
    const result = await helper.queue.listTaskQueues();

    assert.equal(result.taskQueues.length, 0, 'did not expect any task queues');
  });

  test('queue.listTaskQueues requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.listTaskQueues(),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.listTaskQueues returns taskQueues', async () => {
    const tQueue = await makeTaskQueue({});

    const result = await helper.queue.listTaskQueues();
    assert.equal(result.taskQueues.length, 1, 'expected taskQueues');
    assert(result.taskQueues[0].taskQueueId === tQueue.taskQueueId, `expected ${tQueue.taskQueueId}`);
  });

  test('list task queues (limit and continuationToken)', async () => {
    await makeTaskQueue({
      taskQueueId: 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended',
    });
    await makeTaskQueue({
      taskQueueId: 'prov1-extended-extended-extended/gecko-b-2-android',
    });

    let result = await helper.queue.listTaskQueues({ limit: 1 });

    assert(result.continuationToken);
    assert.equal(result.taskQueues.length, 1);

    result = await helper.queue.listTaskQueues({
      limit: 1,
      continuationToken: result.continuationToken,
    });

    assert(!result.continuationToken);
    assert.equal(result.taskQueues.length, 1);
  });

  test('queue.listWorkers returns an empty list', async () => {
    const result = await helper.queue.listWorkers('prov1-extended-extended-extended', 'gecko-b-2-linux-extended-extended');

    assert.equal(result.workers.length, 0, 'Did not expect any workers');
  });

  test('queue.listWorkers requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.listWorkers('prov', 'wt'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.listWorkers returns workers', async () => {
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();

    const worker = await makeWorker({
      recentTasks: [{ taskId, runId: 0 }, { taskId: taskId2, runId: 0 }],
    });

    const [provisionerId, workerType] = worker.taskQueueId.split('/');
    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert.equal(result.workers.length, 1, 'expected workers');
    assert(result.workers[0].workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workers[0].workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(!result.workers[0].quarantineUntil, 'expected quarantineUntil to not be defined');
    assert(result.workers[0].latestTask.taskId === taskId2, `expected ${taskId2}`);
    assert(
      new Date(result.workers[0].firstClaim).getTime() === worker.firstClaim.getTime(), `expected ${worker.firstClaim}`,
    );
  });

  test('queue.listWorkers returns quarantined workers even after expiration', async () => {
    const past = new Date('2001-01-01');
    const future = new Date('3001-01-01');
    const workers = [
      await makeWorker({ workerId: 'old', expires: past, quarantineUntil: past }),
      await makeWorker({ workerId: 'q', expires: past, quarantineUntil: future }),
      await makeWorker({ workerId: 'new', expires: future, quarantineUntil: past }),
      await makeWorker({ workerId: 'newq', expires: future, quarantineUntil: future }),
    ];

    const [provisionerId, workerType] = workers[0].taskQueueId.split('/');
    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert.equal(result.workers.length, 3, `expected three workers, got ${result.workers.map(w => w.workerId).join(', ')}`);
    assert(result.workers.some(w => w.workerId === 'q'));
    assert(result.workers.some(w => w.workerId === 'new'));
    assert(result.workers.some(w => w.workerId === 'newq'));
  });

  test('queue.listWorkers returns filtered workers', async () => {
    const worker = await makeWorker({});
    const [provisionerId, workerType] = worker.taskQueueId.split('/');

    const result = await helper.queue.listWorkers(
      provisionerId, workerType, { quarantined: false },
    );

    const result2 = await helper.queue.listWorkers(
      provisionerId, workerType, { quarantined: true },
    );

    assert.equal(result.workers.length, 1, 'expected 1 worker');
    assert.equal(result2.workers.length, 0, 'expected no worker');
  });

  test('queue.listWorkers returns workers filtered by provisionerId/workerType', async () => {
    const worker = await makeWorker({});
    const [provisionerId, workerType] = worker.taskQueueId.split('/');

    const result = await helper.queue.listWorkers(
      provisionerId, workerType, { quarantined: false },
    );

    const result2 = await helper.queue.listWorkers(
      provisionerId, 'a-non-existing-worker', { quarantined: false },
    );

    assert.equal(result.workers.length, 1, 'expected 1 worker');
    assert.equal(result2.workers.length, 0, 'expected no worker');
  });

  test('list workers (limit and continuationToken)', async () => {
    const provisionerId = 'prov2';
    const workerType = 'gecko-b-2-linux-extended-extended';

    await makeWorker({ taskQueueId: `${provisionerId}/${workerType}`, workerId: 'my-worker1' });
    await makeWorker({ taskQueueId: `${provisionerId}/${workerType}`, workerId: 'my-worker2' });

    let result = await helper.queue.listWorkers(provisionerId, workerType, { limit: 1 });
    assert(result.continuationToken);
    assert.equal(result.workers.length, 1);

    result = await helper.queue.listWorkers(provisionerId, workerType, {
      limit: 1,
      continuationToken: result.continuationToken,
    });
    assert(!result.continuationToken);
    assert.equal(result.workers.length, 1);
  });

  test('workerSeen creates and updates a worker', async () => {
    const workerInfo = await helper.load('workerInfo');
    const provisionerId = 'prov1-extended-extended-extended';
    const workerType = 'gecko-b-2-linux-extended-extended';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';

    await Promise.all([
      workerInfo.seen(`${provisionerId}/${workerType}`, workerGroup, workerId),
      workerInfo.seen(`${provisionerId}/${workerType}`, workerGroup, workerId),
    ]);
    const result = await helper.queue.listWorkers(provisionerId, workerType);
    assert.equal(result.workers.length, 1, 'expected a worker');
  });

  test('worker expiration works', async () => {
    const worker = await makeWorker({
      expires: new Date('2017-07-29'),
    });
    await helper.runExpiration('expire-worker-info');

    const [provisionerId, workerType] = worker.taskQueueId.split('/');
    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert.equal(result.workers.length, 0, 'expected no workers');
  });

  test('queue.quarantineWorker quarantines a worker', async () => {
    await makeTaskQueue({});
    const worker = await makeWorker({
      expires: new Date('3017-07-29'),
    });

    const update = {
      quarantineUntil: taskcluster.fromNowJSON('5 days'),
    };

    const [provisionerId, workerType] = worker.taskQueueId.split('/');
    await helper.queue.quarantineWorker(
      provisionerId,
      workerType,
      worker.workerGroup,
      worker.workerId,
      update);

    const result = await helper.queue.getWorker(
      provisionerId,
      workerType,
      worker.workerGroup,
      worker.workerId);

    assert(
      result.quarantineUntil === update.quarantineUntil,
      `expected quarantineUntil to be ${update.quarantineUntil}`,
    );
  });

  test('queue.getWorkerType requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.getWorkerType('some-prov', 'some-wt'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.getWorkerType returns a worker-type', async () => {
    const tQueue = await makeTaskQueue({});
    const [provisionerId, workerType] = tQueue.taskQueueId.split('/');

    const result = await helper.queue.getWorkerType(provisionerId, workerType);

    assert(result.workerType === workerType, `expected ${workerType}`);
    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.description === tQueue.description, `expected ${tQueue.description}`);
    assert(result.stability === tQueue.stability, `expected ${tQueue.stability}`);
    assert(new Date(result.expires).getTime() === tQueue.expires.getTime(), `expected ${tQueue.expires}`);
  });

  test('queue.getTaskQueue requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.getTaskQueue('some-prov/some-wt'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.getTaskQueue returns a task queue', async () => {
    const tQueue = await makeTaskQueue({});

    const result = await helper.queue.getTaskQueue(tQueue.taskQueueId);

    assert(result.taskQueueId === tQueue.taskQueueId, `expected ${tQueue.taskQueueId}`);
    assert(result.description === tQueue.description, `expected ${tQueue.description}`);
    assert(result.stability === tQueue.stability, `expected ${tQueue.stability}`);
    assert(new Date(result.expires).getTime() === tQueue.expires.getTime(), `expected ${tQueue.expires}`);
  });

  test('queue.declareWorkerType updates a worker-type', async () => {
    const tQueue = await makeTaskQueue({});

    const updateProps = {
      description: 'desc-tQueue',
    };

    const [provisionerId, workerType] = tQueue.taskQueueId.split('/');
    await helper.queue.declareWorkerType(provisionerId, workerType, updateProps);

    const result = await helper.queue.getWorkerType(provisionerId, workerType);

    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.workerType === workerType, `expected ${workerType}`);
    assert(result.description === updateProps.description, `expected ${updateProps.description}`);
    assert(result.stability === tQueue.stability, `expected ${tQueue.stability}`);
    assert(new Date(result.expires).getTime() === tQueue.expires.getTime(), `expected ${tQueue.expires}`);
  });

  test('queue.declareWorkerType creates a provisioner and worker-type', async () => {
    const provisionerId = 'prov1-extended-extended-extended';
    const workerType = 'wtype';
    const updateProps = {
      description: 'desc-wType',
    };

    await helper.queue.declareWorkerType(provisionerId, workerType, updateProps);

    const provisioner = await helper.queue.getProvisioner(provisionerId);
    assert(provisioner.provisionerId === provisionerId, `expected ${provisionerId}`);

    const wType = await helper.queue.getWorkerType(provisionerId, workerType);
    assert(wType.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(wType.workerType === workerType, `expected ${workerType}`);
    assert(wType.description === updateProps.description, `expected ${updateProps.description}`);
    assert(wType.stability === 'experimental', 'expected experimental');
  });

  test('queue.getProvisioner returns a provisioner', async () => {
    const tQueue = await makeTaskQueue({});
    const { provisionerId } = splitTaskQueueId(tQueue.taskQueueId);

    helper.scopes(`queue:get-provisioner:${provisionerId}`);
    const result = await helper.queue.getProvisioner(provisionerId);

    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.description === '', `expected empty string`);
    assert(result.stability === 'experimental', `expected 'experimental'`);
    assert.equal(result.actions.length, 0, 'expected no actions');
    assert(new Date(result.expires).getTime() === tQueue.expires.getTime(), `expected ${tQueue.expires}`);
  });

  test('queue.getProvisioner requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.getProvisioner('some-prov'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.getProvisioner returns 404 when no such provisioner is found', async () => {
    let err;
    try {
      await helper.queue.getProvisioner('no-such');
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.declareProvisioner for a non-existing provisioner returns an error response', async () => {
    const provisionerId = 'prov1-extended-extended-extended';
    const updateProps = {
      description: 'desc-provisioner',
      actions: [{
        name: 'kill',
        title: 'Kill Provisioner',
        context: 'provisioner',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
        method: 'DELETE',
        description: 'Remove provisioner desc-provisioner',
      }],
    };

    let err;
    try {
      await helper.queue.declareProvisioner(provisionerId, updateProps);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.declareProvisioner returns existing provisioner without updating', async () => {
    const provisionerId = 'prov1-extended-extended-extended';
    const taskQueue = await makeTaskQueue({
      taskQueueId: `${provisionerId}/not-important`,
    });

    const updateProps = {
      description: 'desc-provisioner',
      actions: [{
        name: 'kill',
        title: 'Kill Provisioner',
        context: 'provisioner',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
        method: 'DELETE',
        description: 'Remove provisioner desc-provisioner',
      }],
    };

    await helper.queue.declareProvisioner(provisionerId, updateProps);

    const result = await helper.queue.getProvisioner(provisionerId);

    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.description === '', `expected ''`);
    assert(result.stability === 'experimental', `expected 'experimental'`);
    assert(result.actions.length === 0, `expected no actions`);
    assert(new Date(result.expires).getTime() === taskQueue.expires.getTime(), `expected ${taskQueue.expires}`);
  });

  test('worker-type lastDateActive updates', async () => {
    let result;
    const workerInfo = await helper.load('workerInfo');

    const tQueue = {
      taskQueueId: 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended',
    };
    await makeTaskQueue(tQueue);

    await workerInfo.seen(tQueue.taskQueueId);

    let [provisionerId, workerType] = tQueue.taskQueueId.split('/');
    result = await helper.queue.getWorkerType(provisionerId, workerType);

    assert(Math.abs(new Date(result.lastDateActive) - new Date()) < 3600);
  });

  test('provisioner lastDateActive updates', async () => {
    let result;
    const workerInfo = await helper.load('workerInfo');

    const tQueue = await makeTaskQueue({});

    await workerInfo.seen(tQueue.taskQueueId);

    let { provisionerId } = splitTaskQueueId(tQueue.taskQueueId);
    result = await helper.queue.getProvisioner(provisionerId);

    assert(Math.abs(new Date(result.lastDateActive) - new Date()) < 3600);
  });

  test('queue.getWorker returns a worker', async () => {
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();

    await makeTaskQueue({});
    const worker = await makeWorker({
      recentTasks: [
        { taskId, runId: 0 },
        { taskId, runId: 1 },
        { taskId: taskId2, runId: 0 },
      ],
    });

    const [provisionerId, workerType] = worker.taskQueueId.split('/');
    const result = await helper.queue.getWorker(
      provisionerId,
      workerType,
      worker.workerGroup,
      worker.workerId);

    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.workerType === workerType, `expected ${workerType}`);
    assert(result.workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(new Date(result.expires).getTime() === worker.expires.getTime(), `expected ${worker.expires}`);
    assert(new Date(result.firstClaim).getTime() === worker.firstClaim.getTime(), `expected ${worker.firstClaim}`);
    assert(result.recentTasks[0].taskId === taskId, `expected ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected 0');
    assert(result.recentTasks[1].taskId === taskId, `expected ${taskId}`);
    assert(result.recentTasks[1].runId === 1, 'expected 1');
    assert(result.recentTasks[2].taskId === taskId2, `expected ${taskId2}`);
    assert(result.recentTasks[2].runId === 0, 'expected 0');

  });

  test('queue.getWorker returns 404 for a missing Worker', async () => {
    const wType = await makeTaskQueue({});
    const [provisionerId, workerType] = wType.taskQueueId.split('/');

    let err;
    try {
      await helper.queue.getWorker(
        provisionerId,
        workerType,
        'no-such', 'no-such');
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorker returns 404 for an expired Worker', async () => {
    await makeTaskQueue({});
    const worker = await makeWorker({ expires: new Date('2001-01-01') });
    const [provisionerId, workerType] = worker.taskQueueId.split('/');

    let err;
    try {
      await helper.queue.getWorker(
        provisionerId,
        workerType,
        worker.workerGroup,
        worker.workerId);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorker returns an expired Worker that is quarantined', async () => {
    await makeTaskQueue({});
    const worker = await makeWorker({
      expires: new Date('2001-01-01'),
      quarantineUntil: new Date('3001-01-01'),
    });
    const [provisionerId, workerType] = worker.taskQueueId.split('/');

    const result = await helper.queue.getWorker(
      provisionerId,
      workerType,
      worker.workerGroup,
      worker.workerId);
    assert.equal(result.workerId, worker.workerId);
  });

  test('queue.getWorker requires scopes', async () => {
    helper.scopes('none');
    await assert.rejects(
      () => helper.queue.getWorker('some-prov', 'some-wt', 'wg', 'wid'),
      err => err.code === 'InsufficientScopes');
  });

  test('queue.getWorker returns 404 for a missing WorkerType', async () => {
    const worker = await makeWorker({});
    const [provisionerId, workerType] = worker.taskQueueId.split('/');

    let err;
    try {
      await helper.queue.getWorker(
        provisionerId,
        workerType,
        worker.workerGroup,
        worker.workerId);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.declareWorker updates a worker', async () => {
    await makeTaskQueue({});
    const taskId = slugid.v4();
    const worker = await makeWorker({
      recentTasks: [{ taskId, runId: 0 }],
      expires: new Date('2200-01-01'),
    });

    const updateProps = {
      expires: new Date('3000-01-01'),
    };

    const [provisionerId, workerType] = worker.taskQueueId.split('/');
    await helper.queue.declareWorker(
      provisionerId, workerType, worker.workerGroup, worker.workerId, updateProps,
    );

    const result = await helper.queue.getWorker(
      provisionerId, workerType, worker.workerGroup, worker.workerId,
    );

    assert(result.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(result.workerType === workerType, `expected ${workerType}`);
    assert(result.workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(result.recentTasks[0].taskId === taskId, `expected ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected 0');
    assert.deepEqual(new Date(result.expires), updateProps.expires, `expected ${updateProps.expires}`);
  });

  test('queue.declareWorker creates a worker, workerType, and Provisioner', async () => {
    const provisionerId = 'prov1-extended-extended-extended';
    const workerType = 'wtype';
    const workerGroup = 'wgroup-extended-extended';
    const workerId = 'wid-extended-extended';

    const updateProps = {
      expires: new Date('3000-01-01'),
    };

    await helper.queue.declareWorker(
      provisionerId, workerType, workerGroup, workerId, updateProps);

    const worker = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);

    assert(worker.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(worker.workerType === workerType, `expected ${workerType}`);
    assert(worker.workerGroup === workerGroup, `expected ${workerGroup}`);
    assert(worker.workerId === workerId, `expected ${workerId}`);
    assert.equal(worker.recentTasks.length, 0);
    assert(new Date(worker.expires).getTime() === updateProps.expires.getTime(), `expected ${updateProps.expires}`);

    const provisioner = await helper.queue.getProvisioner(provisionerId);
    assert(provisioner.provisionerId === provisionerId, `expected ${provisionerId}`);

    const wType = await helper.queue.getWorkerType(provisionerId, workerType);
    assert(wType.provisionerId === provisionerId, `expected ${provisionerId}`);
    assert(wType.workerType === workerType, `expected ${workerType}`);
    assert(wType.description === '', 'expected empty string');
    assert(wType.stability === 'experimental', 'expected experimental');
  });

  test('queue.declareWorker cannot update quarantineUntil', async () => {
    const taskId = slugid.v4();

    const worker = await makeWorker({
      recentTasks: [{ taskId, runId: 0 }],
    });

    const updateProps = {
      quarantineUntil: new Date('3000-01-01'),
    };

    try {
      await helper.queue.declareWorker(
        worker.provisionerId, worker.workerType, worker.workerGroup, worker.workerId, updateProps,
      );

      assert(false, 'expected to not be able to update quarantineUntil');
    } catch (error) {
      assert(error, 'expected an error');
    }
  });

  test('queue.claimWork adds a task to a worker', async () => {
    const taskQueueId = 'prov1-extended-extended-extended/gecko-b-2-linux-extended-extended';
    const workerGroup = 'my-worker-group-extended-extended';
    const workerId = 'my-worker-extended-extended';
    const taskId = slugid.v4();

    await helper.queue.createTask(taskId, {
      taskQueueId,
      priority: 'normal',
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('30 min'),
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'haali@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    });

    //await makeClaimable(taskStatus);
    await helper.queue.claimWork(taskQueueId, {
      workerGroup,
      workerId,
      tasks: 1,
    });

    const db = await helper.load('db');
    const result = await Worker.get(db, taskQueueId, workerGroup, workerId, new Date());

    assert(result.recentTasks[0].taskId === taskId, `expected taskId ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected runId 0');
  });

  test('queue.getWorker returns 20 most recent taskIds', async () => {
    const taskQueueId = 'no-provisioner/gecko-b-1-android';
    const workerGroup = 'my-worker-group-extended-extended';
    const workerId = 'my-worker-extended-extended';
    await makeTaskQueue({ taskQueueId });

    let taskIds = [];

    for (let i = 0; i < 30; i++) {
      const taskId = slugid.v4();
      taskIds.push(taskId);

      await helper.queue.createTask(taskIds[i], {
        taskQueueId,
        priority: 'normal',
        created: taskcluster.fromNowJSON(),
        deadline: taskcluster.fromNowJSON('30 min'),
        payload: {},
        metadata: {
          name: 'Unit testing task',
          description: 'Task created during unit tests',
          owner: 'haali@mozilla.com',
          source: 'https://github.com/taskcluster/taskcluster-queue',
        },
      });
    }

    let claimed = 0;
    let retries = 30;
    while (claimed < 30) {
      if (!retries--) {
        throw new Error('Could not claim all 30 tasks after multiple attempts');
      }
      const res = await helper.queue.claimWork(taskQueueId, {
        workerGroup,
        workerId,
        tasks: 30,
      });
      claimed += res.tasks.length;
    }

    const { provisionerId, workerType } = splitTaskQueueId(taskQueueId);
    const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);
    const recentTasks = result.recentTasks;

    assert.equal(result.recentTasks.length, 20, 'expected to have 20 tasks');
    assert.deepEqual(recentTasks.map(({ taskId }) => taskId), taskIds.slice(10));
  });
});
