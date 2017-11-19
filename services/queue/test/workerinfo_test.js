suite('provisioners and worker-types', () => {
  var debug       = require('debug')('test:claim-work');
  var assert      = require('assert');
  var _           = require('lodash');
  var Promise     = require('promise');
  var slugid      = require('slugid');
  var Entity      = require('azure-entities');
  var taskcluster = require('taskcluster-client');
  var assume      = require('assume');
  var helper      = require('./helper');
  var testing     = require('taskcluster-lib-testing');

  setup(async function() {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const Worker = await helper.load('Worker', helper.loadOptions);

    await Provisioner.scan({}, {handler: p => p.remove()});
    await WorkerType.scan({}, {handler: p => p.remove()});
    await Worker.scan({}, {handler: p => p.remove()});
  });

  test('queue.listProvisioners returns an empty list', async () => {
    const result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 0, 'Did not expect any provisioners');
  });

  test('queue.listProvisioners returns provisioners', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const provisioner = {
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
      actions: [],
    };

    await Provisioner.create(provisioner);

    const result = await helper.queue.listProvisioners();

    assert(result.provisioners.length === 1, 'expected provisioners');
    assert(result.provisioners[0].provisionerId === provisioner.provisionerId, 'expected prov1');
    assert(result.provisioners[0].description === provisioner.description, 'expected description');
    assert(result.provisioners[0].stability === provisioner.stability, 'expected stability');
    assert(result.provisioners[0].actions.length === 0, 'expected no actions');
  });

  test('provisioner seen creates and updates a provisioner', async () => {
    const workerInfo = await helper.load('workerInfo', helper.loadOptions);

    await Promise.all([
      workerInfo.seen('prov2'),
      workerInfo.seen('prov2'),
    ]);
    await workerInfo.seen('prov2');

    const result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 1, 'expected a provisioner');
  });

  test('provisioner expiration works', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);

    await Provisioner.create({
      provisionerId: 'prov1',
      expires: new Date('1017-07-29'),
      lastDateActive: new Date(),
      description: 'test-prov',
      stability: 'experimental',
      actions: [],
    });
    await helper.expireWorkerInfo();

    const result = await helper.queue.listProvisioners();
    assert(result.provisioners.length === 0, 'expected no provisioners');
  });

  test('queue.listWorkerTypes returns an empty list', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const result = await helper.queue.listWorkerTypes('no-provisioner');

    assert(result.workerTypes.length === 0, 'did not expect any worker-types');
  });

  test('queue.listWorkerTypes returns workerTypes', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const wType = {
      provisionerId: 'prov-A',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    };

    await WorkerType.create(wType);

    const result = await helper.queue.listWorkerTypes('prov-A');

    assert(result.workerTypes.length === 1, 'expected workerTypes');
    assert(result.workerTypes[0].workerType === wType.workerType, `expected ${wType.workerType}`);
  });

  test('queue.listWorkerTypes returns actions with the right context', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);

    const provisioner = {
      provisionerId: 'prov-B',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
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
    };

    const wType = {
      provisionerId: 'prov-B',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    };

    await Provisioner.create(provisioner);
    await WorkerType.create(wType);

    const result = await helper.queue.listWorkerTypes('prov-B');

    assert(result.workerTypes.length === 1, 'expected workerTypes');
    assert(result.workerTypes[0].workerType === wType.workerType, `expected ${wType.workerType}`);
    assert(result.actions.length === 1, 'expected 1 action');
    assert(result.actions[0].context === 'worker-type', 'expected action with context worker-type');
  });

  test('list worker-types (limit and continuationToken)', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const expires = new Date('3017-07-29');
    const wType = {
      provisionerId: 'prov1',
      expires,
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    };

    await WorkerType.create(Object.assign({}, {workerType: 'gecko-b-2-linux'}, wType));
    await WorkerType.create(Object.assign({}, {workerType: 'gecko-b-2-android'}, wType));

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
    const workerInfo = await helper.load('workerInfo', helper.loadOptions);
    const workerType = 'gecko-b-2-linux';

    await Promise.all([
      workerInfo.seen('prov2', workerType),
      workerInfo.seen('prov2', workerType),
    ]);

    const result = await helper.queue.listWorkerTypes('prov2');
    assert(result.workerTypes.length === 1, 'expected a worker-type');
  });

  test('worker-type expiration works', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);

    await WorkerType.create({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      expires: new Date('1017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    });
    await helper.expireWorkerInfo();

    const result = await helper.queue.listWorkerTypes('prov1');
    assert(result.workerTypes.length === 0, 'expected no worker-types');
  });

  test('queue.listWorkers returns an empty list', async () => {
    const result = await helper.queue.listWorkers('prov1', 'gecko-b-2-linux');

    assert(result.workers.length === 0, 'Did not expect any workers');
  });

  test('queue.listWorkers returns workers', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();
    const worker = {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      recentTasks: [],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    };

    worker.recentTasks.push({taskId, runId: 0});
    worker.recentTasks.push({taskId: taskId2, runId: 0});

    await Worker.create(worker);

    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert(result.workers.length === 1, 'expected workers');
    assert(result.workers[0].workerGroup === worker.workerGroup, `expected ${worker.workerGroup}`);
    assert(result.workers[0].workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(result.workers[0].quarantineUntil === null, 'expected quarantineUntil to be null');
    assert(result.workers[0].latestTask.taskId === taskId2, `expected ${taskId2}`);
    assert(
      new Date(result.workers[0].firstClaim).getTime() === worker.firstClaim.getTime(), `expected ${worker.firstClaim}`
    );
  });

  test('queue.listWorkers returns actions with the right context', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov-B';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';

    const provisioner = {
      provisionerId,
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
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
    };

    const worker = {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      recentTasks: [],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    };

    await Provisioner.create(provisioner);
    await Worker.create(worker);

    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert(result.workers.length === 1, 'expected workers');
    assert(result.workers[0].workerId === worker.workerId, `expected ${worker.workerId}`);
    assert(result.actions.length === 1, 'expected 1 action');
    assert(result.actions[0].context === 'worker', 'expected action with context worker');
  });

  test('queue.listWorkers returns filtered workers', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';

    const worker = {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      recentTasks: [],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    };

    await Worker.create(worker);

    const result = await helper.queue.listWorkers(
      provisionerId, workerType, {quarantined: false}
    );

    const result2 = await helper.queue.listWorkers(
      provisionerId, workerType, {quarantined: true}
    );

    assert(result.workers.length === 1, 'expected 1 worker');
    assert(result2.workers.length === 0, 'expected no worker');
  });

  test('list workers (limit and continuationToken)', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const expires = new Date('3017-07-29');
    const provisionerId = 'prov2';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const worker = {
      provisionerId,
      workerType,
      workerGroup,
      workerId: 'my-worker1',
      recentTasks: [],
      expires,
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    };

    await Worker.create(worker);

    worker.workerId = 'my-worker2';

    await Worker.create(worker);

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
    const workerInfo = await helper.load('workerInfo', helper.loadOptions);
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
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov2';
    const workerType = 'gecko-b-2-linux';

    await Worker.create({
      provisionerId, workerType,
      workerGroup: 'my-worker-group',
      workerId: 'my-worker',
      recentTasks: [],
      expires: new Date('1017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    });
    await helper.expireWorkerInfo();

    const result = await helper.queue.listWorkers(provisionerId, workerType);

    assert(result.workers.length === 0, 'expected no workers');
  });

  test('queue.quarantineWorker quarantines a worker', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov2';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    const quarantineUntil = new Date();

    await Worker.create({
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      recentTasks: [],
      expires: new Date('3017-07-29'),
      quarantineUntil,
      firstClaim: new Date(),
    });

    const update = {
      quarantineUntil: taskcluster.fromNowJSON('5 days'),
    };

    await helper.queue.quarantineWorker(provisionerId, workerType, workerGroup, workerId, update);

    const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);

    assert(
      result.quarantineUntil === update.quarantineUntil,
      `expected quarantineUntil to be ${update.quarantineUntil}`
    );
  });

  test('queue.getWorkerType returns a worker-type', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const wType = {
      provisionerId: 'prov-A',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    };

    await WorkerType.create(wType);

    const result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(result.workerType === wType.workerType, `expected ${wType.workerType}`);
    assert(result.provisionerId === wType.provisionerId, `expected ${wType.provisionerId}`);
    assert(result.description === wType.description, `expected ${wType.description}`);
    assert(result.stability === wType.stability, `expected ${wType.stability}`);
    assert(new Date(result.expires).getTime() === wType.expires.getTime(), `expected ${wType.expires}`);
  });

  test('queue.getWorkerType returns actions with the right context', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);

    const provisioner = {
      provisionerId: 'prov-B',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
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
    };

    const wType = {
      provisionerId: 'prov-B',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-worker-type',
      stability: 'experimental',
    };

    await Provisioner.create(provisioner);
    await WorkerType.create(wType);

    const result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(result.workerType === wType.workerType, `expected ${wType.workerType}`);
    assert(result.actions.length === 1, 'expected 1 action');
    assert(result.actions[0].context === 'worker-type', 'expected action with context worker-type');
  });

  test('queue.declareWorkerType updates a worker-type', async () => {
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);

    const wType = await WorkerType.create({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-wType',
      stability: 'experimental',
    });

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

  test('queue.getProvisioner returns a provisioner', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const provisioner = {
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
      actions: [],
    };

    await Provisioner.create(provisioner);

    const result = await helper.queue.getProvisioner(provisioner.provisionerId);

    assert(result.provisionerId === provisioner.provisionerId, `expected ${provisioner.provisionerId}`);
    assert(result.description === provisioner.description, `expected ${provisioner.description}`);
    assert(result.stability === provisioner.stability, `expected ${provisioner.stability}`);
    assert(result.actions.length === 0, 'expected no actions');
    assert(new Date(result.expires).getTime() === provisioner.expires.getTime(), `expected ${provisioner.expires}`);
  });

  test('queue.declareProvisioner updates a provisioner', async () => {
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);

    const provisioner = await Provisioner.create({
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
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
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);

    const provisioner = await Provisioner.create({
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-provisioner',
      stability: 'experimental',
      actions: [],
    });

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
    const WorkerType = await helper.load('WorkerType', helper.loadOptions);
    const workerInfo = await helper.load('workerInfo', helper.loadOptions);

    const wType = {
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-wType',
      stability: 'experimental',
    };

    await WorkerType.create(wType);
    await workerInfo.seen(wType.provisionerId, wType.workerType);

    result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(
      new Date(result.lastDateActive).getTime() === wType.lastDateActive.getTime(), `expected ${wType.lastDateActive}`
    );

    wType.workerType = 'gecko-b-2-android';
    wType.lastDateActive = taskcluster.fromNow('- 7h');

    await WorkerType.create(wType);
    await workerInfo.seen(wType.provisionerId, wType.workerType);

    result = await helper.queue.getWorkerType(wType.provisionerId, wType.workerType);

    assert(
      new Date(result.lastDateActive).getTime() !== wType.lastDateActive.getTime(), 'expected different lastDateActive'
    );
  });

  test('provisioner lastDateActive updates', async () => {
    let result;
    const Provisioner = await helper.load('Provisioner', helper.loadOptions);
    const workerInfo = await helper.load('workerInfo', helper.loadOptions);

    const prov = {
      provisionerId: 'prov1',
      expires: new Date('3017-07-29'),
      lastDateActive: new Date(),
      description: 'test-prov',
      stability: 'experimental',
      actions: [],
    };

    await Provisioner.create(prov);
    await workerInfo.seen(prov.provisionerId);

    result = await helper.queue.getProvisioner(prov.provisionerId);

    assert(
      new Date(result.lastDateActive).getTime() === prov.lastDateActive.getTime(), `expected ${prov.lastDateActive}`
    );

    prov.lastDateActive = taskcluster.fromNow('- 7h');
    prov.provisionerId = 'prov2';

    await Provisioner.create(prov);
    await workerInfo.seen(prov.provisionerId);

    result = await helper.queue.getProvisioner(prov.provisionerId);

    assert(
      new Date(result.lastDateActive).getTime() !== prov.lastDateActive.getTime(), 'expected different lastDateActive'
    );
  });

  test('queue.getWorker returns workers', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    const taskId = slugid.v4();
    const taskId2 = slugid.v4();
    const recentTasks = [];

    recentTasks.push({taskId, runId: 0});
    recentTasks.push({taskId, runId: 1});
    recentTasks.push({taskId: taskId2, runId: 0});

    const worker = {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      recentTasks,
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
    };

    await Worker.create(worker);
    const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);

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

  test('queue.declareWorker updates a worker', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const taskId = slugid.v4();

    const worker = await Worker.create({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      workerGroup: 'my-worker-group',
      workerId: 'my-worker',
      recentTasks: [{taskId, runId: 0}],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
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

  test('queue.declareWorker cannot update quarantineUntil', async () => {
    const Worker = await helper.load('Worker', helper.loadOptions);
    const taskId = slugid.v4();

    const worker = await Worker.create({
      provisionerId: 'prov1',
      workerType: 'gecko-b-2-linux',
      workerGroup: 'my-worker-group',
      workerId: 'my-worker',
      recentTasks: [{taskId, runId: 0}],
      expires: new Date('3017-07-29'),
      quarantineUntil: new Date(),
      firstClaim: new Date(),
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
    const Worker = await helper.load('Worker', helper.loadOptions);
    const provisionerId = 'prov1';
    const workerType = 'gecko-b-2-linux';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    const taskId = slugid.v4();

    await helper.queue.createTask(taskId, {
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

    await helper.queue.claimWork(provisionerId, workerType, {
      workerGroup,
      workerId,
      tasks: 1,
    });

    const result = await Worker.load({provisionerId, workerType, workerGroup, workerId});

    assert(result.recentTasks[0].taskId === taskId, `expected taskId ${taskId}`);
    assert(result.recentTasks[0].runId === 0, 'expected runId 0');
  });

  test('queue.getWorker returns 20 most recent taskIds', async () => {
    const provisionerId = 'no-provisioner';
    const workerType = 'gecko-b-1-android';
    const workerGroup = 'my-worker-group';
    const workerId = 'my-worker';
    let taskIds = [];

    for (let i = 0; i < 30; i++) {
      taskIds.push(slugid.v4());

      await helper.queue.createTask(taskIds[i], {
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

    await helper.queue.claimWork(provisionerId, workerType, {
      workerGroup,
      workerId,
      tasks: 30,
    });

    const result = await helper.queue.getWorker(provisionerId, workerType, workerGroup, workerId);
    const recentTasks = result.recentTasks;

    assert(result.recentTasks.length === 20, 'expected to have 20 tasks');

    for (let i =0; i < 20; i++) {
      assert(recentTasks[i].taskId === taskIds[i + 10], `expected taskId ${taskIds[i + 10]}`);
    }
  });
});
