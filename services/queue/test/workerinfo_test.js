const debug = require('debug')('test:claim-work');
const assert = require('assert');
const _ = require('lodash');
const slugid = require('slugid');
const Entity = require('azure-entities');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  const makeProvisioner = async (opts) => {
    const provisioner = Object.assign({
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
      actions: [],
    }, opts);
    await helper.Provisioner.create(provisioner);
    return provisioner;
  };
  
  const makeWorkerType = async (opts) => {
    const wType = Object.assign({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    }, opts);

    await helper.WorkerType.create(wType);
    return wType;
  };

  const makeWorker = async (opts) => {
    const worker = Object.assign({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      workerGroup: 'my-worker-group',
      workerId: 'my-worker',
      recentTasks: [],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    }, opts);

    await helper.Worker.create(worker);

    return worker;
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
    assert(result.provisioners.length === 0, 'Did not expect any provisioners');
  });

  test('queue.listProvisioners returns provisioners', async () => {
    const provisioner = await makeProvisioner({});

    const result = await helper.queue.listProvisioners();

    assert(result.provisioners.length === 1, 'expected provisioners');
    assert(result.provisioners[0].provisionerId === provisioner.provisionerId, 'expected prov1');
    assert(result.provisioners[0].description === provisioner.description, 'expected description');
    assert(result.provisioners[0].stability === provisioner.stability, 'expected stability');
    assert(result.provisioners[0].actions.length === 0, 'expected no actions');
  });

  test('provisioner seen creates and updates a provisioner', async () => {
    const workerInfo = await helper.load('workerInfo');

    await Promise.all([
      workerInfo.seen('prov2'),
      workerInfo.seen('prov2'),
    ]);
    await workerInfo.seen('prov2');

    const result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 1, 'expected a provisioner');
  });

  test('provisioner expiration works', async () => {
    await makeProvisioner({expires: new Date('2000-01-01')});

    await helper.runExpiration('expire-worker-info');

    const result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 0, 'expected no provisioners');
  });

  test('queue.listWorkerTypes returns an empty list', async () => {
    const result = await helper.queue.listWorkerTypes('no-provisioner');

    assert(result.workerTypes.length === 0, 'did not expect any worker-types');
  });

  test('queue.listWorkerTypes returns workerTypes', async () => {
    const wType = await makeWorkerType({});

    const result = await helper.queue.listWorkerTypes('prov1');

    assert(result.workerTypes.length === 1, 'expected workerTypes');
    assert(result.workerTypes[0].workerType === wType.workerType, `expected ${wType.workerType}`);
  });

  test('queue.listWorkerTypes returns actions with the right context', async () => {
    await makeProvisioner({
      provisionerId: 'prov-B',
      actions: [{
        name: 'kill',
        title: 'Kill Provisioner',
        context: 'provisioner',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
        method: 'DELETE',
        description: 'Remove provisioner prov-B',
      }, {
        name: 'kill',
        title: 'Kill Worker Type',
        context: 'worker-type',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>/<workerType>',
        method: 'DELETE',
        description: 'Remove worker type',
      }],
    });
    const wType = await makeWorkerType({provisionerId: 'prov-B'});

    const result = await helper.queue.listWorkerTypes('prov-B');

    assert(result.workerTypes.length === 1, 'expected workerTypes');
    assert(result.workerTypes[0].workerType === wType.workerType, `expected ${wType.workerType}`);
  });

  test('list worker-types (limit and continuationToken)', async () => {
    await makeWorkerType({workerType: 'gecko-b-2-linux'});
    await makeWorkerType({workerType: 'gecko-b-2-android'});

    let result = await helper.queue.listWorkerTypes('prov1', {limit: 1});

    assert(result.continuationToken);
    assert(result.workerTypes.length === 1);

    result = await helper.queue.listWorkerTypes('prov1', {
      limit: 1,
      continuationToken: result.continuationToken,
    });

    assert(!result.continuationToken);
    assert(result.workerTypes.length === 1);
  });

  test('worker-type seen creates and updates a worker-type', async () => {
    const workerInfo = await helper.load('workerInfo');
    const workerType = 'gecko-b-2-linux';

    await Promise.all([
      workerInfo.seen('prov2', workerType),
      workerInfo.seen('prov2', workerType),
    ]);

    const result = await helper.queue.listWorkerTypes('prov2');
    assert(result.workerTypes.length === 1, 'expected a worker-type');
  });

  test('worker-type expiration works', async () => {
    await makeWorkerType({
      expires: new Date('2017-07-29'),
    });

    await helper.runExpiration('expire-worker-info');

    const result = await helper.queue.listWorkerTypes('prov1');
    assert(result.workerTypes.length === 0, 'expected no worker-types');
  });

  test('queue.listWorkers returns an empty list', async () => {
    const result = await helper.queue.listWorkers('prov1', 'gecko-b-2-linux');

    assert(result.workers.length === 0, 'Did not expect any workers');
  });

  test('queue.listWorkers returns workers', async () => {
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();

    const worker = await makeWorker({
      recentTasks: [{taskId, runId: 0}, {taskId: taskId2, runId: 0}],
    });

    const result = await helper.queue.listWorkers(worker.provisionerId, worker.workerType);

    assert(result.workers.length === 1, 'expected workers');
    assert(result.workers[0].workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workers[0].workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(!result.workers[0].quarantineUntil, 'expected quarantineUntil to not be defined');
    assert(result.workers[0].latestTask.taskId === taskId2, `expected ${taskId2}`);
    assert(
      new Date(result.workers[0].firstClaim).getTime() === worker.firstClaim.getTime(), `expected ${worker.firstClaim}`
    );
  });

  test('queue.listWorkers returns actions with the right context', async () => {
    await makeProvisioner({
      actions: [{
        name: 'kill',
        title: 'Kill Provisioner',
        context: 'provisioner',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
        method: 'DELETE',
        description: 'Remove provisioner prov-B',
      }, {
        name: 'kill',
        title: 'Kill Worker',
        context: 'worker',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<workerGroup>/<workerId>',
        method: 'DELETE',
        description: 'Remove worker',
      }],
    });
    const worker = await makeWorker({});

    const result = await helper.queue.listWorkers(worker.provisionerId, worker.workerType);

    assert(result.workers.length === 1, 'expected workers');
    assert(result.workers[0].workerId === worker.workerId, `expected ${worker.workerId}`);
  });

  test('queue.listWorkers returns filtered workers', async () => {
    const worker = await makeWorker({});

    const result = await helper.queue.listWorkers(
      worker.provisionerId, worker.workerType, {quarantined: false}
    );

    const result2 = await helper.queue.listWorkers(
      worker.provisionerId, worker.workerType, {quarantined: true}
    );

    assert(result.workers.length === 1, 'expected 1 worker');
    assert(result2.workers.length === 0, 'expected no worker');
  });

  test('list workers (limit and continuationToken)', async () => {
    const provisionerId = 'prov2';
    const workerType = 'gecko-b-2-linux';

    await makeWorker({provisionerId, workerType, workerId: 'my-worker1'});
    await makeWorker({provisionerId, workerType, workerId: 'my-worker2'});

    let result = await helper.queue.listWorkers(provisionerId, workerType, {limit: 1});
    assert(result.continuationToken);
    assert(result.workers.length === 1);

    result = await helper.queue.listWorkers(provisionerId, workerType, {
      limit: 1,
      continuationToken: result.continuationToken,
    });
    assert(!result.continuationToken);
    assert(result.workers.length === 1);
  });

  test('workerSeen creates and updates a worker', async () => {
    const workerInfo = await helper.load('workerInfo');
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';

    await Promise.all([
      workerInfo.seen(provisionerId, workerType, workerGroup, workerId),
      workerInfo.seen(provisionerId, workerType, workerGroup, workerId),
    ]);

    const result = await helper.queue.listWorkers(provisionerId, workerType);
    assert(result.workers.length === 1, 'expected a worker');
  });

  test('worker expiration works', async () => {
    const worker = await makeWorker({
      expires: new Date('2017-07-29'),
    });
    await helper.runExpiration('expire-worker-info');

    const result = await helper.queue.listWorkers(worker.provisionerId, worker.workerType);

    assert(result.workers.length === 0, 'expected no workers');
  });

  test('queue.quarantineWorker quarantines a worker', async () => {
    await makeProvisioner({});
    await makeWorkerType({});
    const worker = await makeWorker({
      expires: new Date('3017-07-29'),
    });

    const update = {
      quarantineUntil: taskcluster.fromNowJSON('5 days'),
    };

    await helper.queue.quarantineWorker(
      worker.provisionerId,
      worker.workerType,
      worker.workerGroup,
      worker.workerId,
      update);

    const result = await helper.queue.getWorker(
      worker.provisionerId,
      worker.workerType,
      worker.workerGroup,
      worker.workerId);

    assert(
      result.quarantineUntil === update.quarantineUntil,
      `expected quarantineUntil to be ${update.quarantineUntil}`
    );
  });

  test('queue.getWorkerType returns a worker-type', async () => {
    await makeProvisioner({});
    const wType = await makeWorkerType({});

    const result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(result.workerType === wType.workerType, `expected ${wType.workerType}`);
    assert(result.provisionerId === wType.provisionerId, `expected ${wType.provisionerId}`);
    assert(result.description === wType.description, `expected ${wType.description}`);
    assert(result.stability === wType.stability, `expected ${wType.stability}`);
    assert(new Date(result.expires).getTime() === wType.expires.getTime(), `expected ${wType.expires}`);
  });

  test('queue.getWorkerType returns 404 for missing provisionerId', async () => {
    const wType = await makeWorkerType({});

    let err;
    try {
      await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorkerType returns 404 for existing provisionerId, but nonexistent workerType', async () => {
    const provisioner = await makeProvisioner({});

    let err;
    try {
      await helper.queue.getWorkerType(provisioner.provisionerId, 'no-such');
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorkerType returns actions with the right context', async () => {
    await makeProvisioner({
      provisionerId: 'prov-B',
      actions: [{
        name: 'kill',
        title: 'Kill Provisioner',
        context: 'provisioner',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
        method: 'DELETE',
        description: 'Remove provisioner prov-B',
      }, {
        name: 'kill',
        title: 'Kill Worker Type',
        context: 'worker-type',
        url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>/<workerType>',
        method: 'DELETE',
        description: 'Remove worker type',
      }],
    });
    const wType = await makeWorkerType({provisionerId: 'prov-B'});

    const result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(result.workerType === wType.workerType, `expected ${wType.workerType}`);
    assert(result.actions.length === 1, 'expected 1 action');
    assert(result.actions[0].context === 'worker-type', 'expected action with context worker-type');
  });

  test('queue.declareWorkerType updates a worker-type', async () => {
    await makeProvisioner({});
    const wType = await makeWorkerType({});

    const updateProps = {
      description: 'desc-wType',
    };

    await helper.queue.declareWorkerType(wType.provisionerId, wType.workerType, updateProps);

    const result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(result.provisionerId === wType.provisionerId, `expected ${wType.provisionerId}`);
    assert(result.workerType === wType.workerType, `expected ${wType.provisionerId}`);
    assert(result.description === updateProps.description, `expected ${updateProps.description}`);
    assert(result.stability === wType.stability, `expected ${wType.stability}`);
    assert(new Date(result.expires).getTime() === wType.expires.getTime(), `expected ${wType.expires}`);
  });

  test('queue.declareWorkerType creates a provisioner and worker-type', async () => {
    const provisionerId = 'prov1';
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
    const provisioner = await makeProvisioner({});

    const result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(result.provisionerId === provisioner.provisionerId, `expected ${provisioner.provisionerId}`);
    assert(result.description === provisioner.description, `expected ${provisioner.description}`);
    assert(result.stability === provisioner.stability, `expected ${provisioner.stability}`);
    assert(result.actions.length === 0, 'expected no actions');
    assert(new Date(result.expires).getTime() === provisioner.expires.getTime(), `expected ${provisioner.expires}`);
  });

  test('queue.getProvisioner returns 404 when no such provisioner is found', async () => {
    let err;
    try {
      const result = await helper.queue.getProvisioner('no-such');
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.declareProvisioner creates a provisioner', async () => {
    const provisionerId = 'prov1';
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
    assert(result.description === updateProps.description, `expected ${updateProps.description}`);
    assert(result.stability === 'experimental', 'expected experimental');
    assert(result.actions[0].url === updateProps.actions[0].url, `expected action url ${updateProps.actions[0].url}`);
  });

  test('queue.declareProvisioner updates a provisioner', async () => {
    const provisioner = await makeProvisioner({
      provisionerId: 'prov1',
      description: 'test-provisioner',
      actions: [],
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

    await helper.queue.declareProvisioner(provisioner.provisionerId, updateProps);

    const result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(result.provisionerId === provisioner.provisionerId, `expected ${provisioner.provisionerId}`);
    assert(result.description === updateProps.description, `expected ${updateProps.description}`);
    assert(result.stability === provisioner.stability, `expected ${provisioner.stability}`);
    assert(result.actions[0].url === updateProps.actions[0].url, `expected action url ${updateProps.actions[0].url}`);
    assert(new Date(result.expires).getTime() === provisioner.expires.getTime(), `expected ${provisioner.expires}`);
  });

  test('queue.declareProvisioner adds two actions to a provisioner', async () => {
    const provisioner = await makeProvisioner({});

    const actionOne = {
      name: 'kill',
      title: 'Kill Provisioner',
      context: 'provisioner',
      url: 'https://hardware-provisioner.mozilla-releng.net/v1/power-cycle/<provisionerId>',
      method: 'DELETE',
      description: 'Remove provisioner desc-provisioner',
    };

    const actionTwo = {
      name: 'reboot',
      title: 'Reboot Provisioner',
      context: 'provisioner',
      url: 'https://hardware-provisioner.mozilla-releng.net/v1/reboot/<provisionerId>',
      method: 'DELETE',
      description: 'Reboot provisioner desc-provisioner',
    };

    await helper.queue.declareProvisioner(provisioner.provisionerId, {actions: [actionOne, actionTwo]});

    const result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(result.actions.length === 2, 'expected 2 actions');
    assert(result.actions[0].url === actionOne.url, `expected url to be ${actionOne.url}`);
    assert(result.actions[1].url === actionTwo.url, `expected url to be ${actionTwo.url}`);
  });

  test('worker-type lastDateActive updates', async () => {
    let result;
    const workerInfo = await helper.load('workerInfo');

    await makeProvisioner({});
    const wType = {
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      lastDateActive: new Date(),
    };
    await makeWorkerType(wType);

    await workerInfo.seen(wType.provisionerId, wType.workerType);

    result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(
      new Date(result.lastDateActive).getTime() === wType.lastDateActive.getTime(), `expected ${wType.lastDateActive}`
    );

    wType.workerType = 'gecko-b-2-android';
    wType.lastDateActive = taskcluster.fromNow('- 7h');
    await makeWorkerType(wType);

    await workerInfo.seen(wType.provisionerId, wType.workerType);

    result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(
      new Date(result.lastDateActive).getTime() !== wType.lastDateActive.getTime(), 'expected different lastDateActive'
    );
  });

  test('provisioner lastDateActive updates', async () => {
    let result;
    const workerInfo = await helper.load('workerInfo');

    const provisioner = await makeProvisioner({});

    await workerInfo.seen(provisioner.provisionerId);

    result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(new Date(result.lastDateActive).getTime() === provisioner.lastDateActive.getTime(),
      `expected ${provisioner.lastDateActive}`);

    provisioner.lastDateActive = taskcluster.fromNow('- 7h');
    provisioner.provisionerId = 'prov2';

    await workerInfo.seen(provisioner.provisionerId);

    result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(new Date(result.lastDateActive).getTime() !== provisioner.lastDateActive.getTime(),
      'expected different lastDateActive');
  });

  test('queue.getWorker returns workers', async () => {
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();

    await makeProvisioner({});
    await makeWorkerType({});
    const worker = await makeWorker({
      recentTasks: [
        {taskId, runId: 0},
        {taskId, runId: 1},
        {taskId: taskId2, runId: 0},
      ],
    });

    const result = await helper.queue.getWorker(
      worker.provisionerId,
      worker.workerType,
      worker.workerGroup,
      worker.workerId);

    assert(result.provisionerId === worker.provisionerId, `expected ${worker.provisionerId}`);
    assert(result.workerType === worker.workerType, `expected ${worker.workerType}`);
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
    await makeProvisioner({});
    const wType = await makeWorkerType({});

    let err;
    try {
      const result = await helper.queue.getWorker(
        wType.provisionerId,
        wType.workerType,
        'no-such', 'no-such');
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorker returns 404 for a missing WorkerType', async () => {
    await makeProvisioner({});
    const worker = await makeWorker({});

    let err;
    try {
      const result = await helper.queue.getWorker(
        worker.provisionerId,
        worker.workerType,
        worker.workerGroup,
        worker.workerId);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.getWorker returns 404 for a missing Provisioner', async () => {
    await makeWorkerType({});
    const worker = await makeWorker({});

    let err;
    try {
      const result = await helper.queue.getWorker(
        worker.provisionerId,
        worker.workerType,
        worker.workerGroup,
        worker.workerId);
    } catch (e) {
      err = e;
    }
    assert(err, 'expected an error');
    assert(err.statusCode === 404, 'expected 404');
  });

  test('queue.declareWorker updates a worker', async () => {
    await makeProvisioner({});
    await makeWorkerType({});
    const taskId = slugid.v4();
    const worker = await makeWorker({
      recentTasks: [{taskId, runId: 0}],
    });

    const updateProps = {
      expires: new Date('3000-01-01'),
    };

    await helper.queue.declareWorker(
      worker.provisionerId, worker.workerType, worker.workerGroup, worker.workerId, updateProps
    );

    const result = await helper.queue.getWorker(
      worker.provisionerId, worker.workerType, worker.workerGroup, worker.workerId
    );

    assert(result.provisionerId === worker.provisionerId, `expected ${worker.provisionerId}`);
    assert(result.workerType === worker.workerType, `expected ${worker.workerType}`);
    assert(result.workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(result.recentTasks[0].taskId === taskId, `expected ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected 0');
    assert(new Date(result.expires).getTime() === updateProps.expires.getTime(), `expected ${updateProps.expires}`);
  });

  test('queue.declareWorker creates a worker, workerType, and Provisioner', async () => {
    const provisionerId = 'prov1';
    const workerType = 'wtype';
    const workerGroup = 'wgroup';
    const workerId = 'wid';

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
    assert(worker.recentTasks.length === 0);
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
      recentTasks: [{taskId, runId: 0}],
    });

    const updateProps = {
      quarantineUntil: new Date('3000-01-01'),
    };

    try {
      await helper.queue.declareWorker(
        worker.provisionerId, worker.workerType, worker.workerGroup, worker.workerId, updateProps
      );

      assert(false, 'expected to not be able to update quarantineUntil');
    } catch (error) {
      assert(error, 'expected an error');
    }
  });

  test('queue.claimWork adds a task to a worker', async () => {
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    const taskId = slugid.v4();

    const taskStatus = await helper.queue.createTask(taskId, {
      provisionerId,
      workerType,
      priority: 'normal',
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('30 min'),
      payload: {},
      metadata: {
        name:           'Unit testing task',
        description:    'Task created during unit tests',
        owner:          'haali@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue',
      },
    });

    //await makeClaimable(taskStatus);
    await helper.queue.claimWork(provisionerId, workerType, {
      workerGroup,
      workerId,
      tasks: 1,
    });

    const result = await helper.Worker.load({provisionerId, workerType, workerGroup, workerId});

    assert(result.recentTasks[0].taskId === taskId, `expected taskId ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected runId 0');
  });

  test('queue.getWorker returns 20 most recent taskIds', async () => {
    const provisionerId = 'no-provisioner';
    const workerType = 'gecko-b-1-android';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    await makeProvisioner({provisionerId});

    let taskIds = [];

    for (let i = 0; i < 30; i++) {
      const taskId = slugid.v4();
      taskIds.push(taskId);

      const taskStatus = await helper.queue.createTask(taskIds[i], {
        provisionerId,
        workerType,
        priority: 'normal',
        created: taskcluster.fromNowJSON(),
        deadline: taskcluster.fromNowJSON('30 min'),
        payload: {},
        metadata: {
          name:           'Unit testing task',
          description:    'Task created during unit tests',
          owner:          'haali@mozilla.com',
          source:         'https://github.com/taskcluster/taskcluster-queue',
        },
      });
    }

    let claimed = 0;
    let retries = 30;
    while (claimed < 30) {
      if (!retries--) {
        throw new Error('Could not claim all 30 tasks after multiple attempts');
      }
      const res = await helper.queue.claimWork(provisionerId, workerType, {
        workerGroup,
        workerId,
        tasks: 30,
      });
      claimed += res.tasks.length;
    }

    const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);
    const recentTasks = result.recentTasks;

    assert.equal(result.recentTasks.length, 20, 'expected to have 20 tasks');

    for (let i =0; i < 20; i++) {
      assert(recentTasks[i].taskId === taskIds[i + 10], `expected taskId ${taskIds[i + 10]}`);
    }
  });
});
